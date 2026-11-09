#!/usr/bin/env python3
"""
One-off export of the Polish wav2vec2 CTC model to ONNX + dynamic q8 quantisation (spec 5.4).

ClearVoice AI uses a ready-made ONNX export by default (XDcobra/wav2vec2-large-xlsr-53-polish-ONNX);
run this script only if you want to publish your own copy (e.g. a different base model).

Requirements:
    pip install "optimum[exporters,onnxruntime]" transformers huggingface_hub

Usage:
    python scripts/export_ctc_onnx.py --out ./ctc-onnx
    python scripts/export_ctc_onnx.py --out ./ctc-onnx --push your-user/wav2vec2-pl-onnx

The resulting folder layout matches what Transformers.js expects:
    config.json, preprocessor_config.json, tokenizer.json/vocab.json, onnx/model.onnx, onnx/model_quantized.onnx
Then set CTC_REPO in src/workers/models.ts to the published repo id.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

BASE_MODEL = "jonatasgrosman/wav2vec2-large-xlsr-53-polish"
EXPECTED = set("aąbcćdeęfghijklłmnńoóprsśtuwyzźż")


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=BASE_MODEL, help="HF model id of a wav2vec2 CTC model")
    ap.add_argument("--out", default="ctc-onnx", help="output directory")
    ap.add_argument("--push", default=None, help="optional HF repo id to upload the export to")
    args = ap.parse_args()

    out = Path(args.out)
    tmp = out / "_export"
    if tmp.exists():
        shutil.rmtree(tmp)

    # 1. Export fp32 ONNX (CTC head → logits T×V).
    run([sys.executable, "-m", "optimum.exporters.onnx", "--model", args.model, "--task", "automatic-speech-recognition", str(tmp)])

    # 2. Dynamic int8 quantisation (weights only) – ~4x smaller, accuracy loss negligible for alignment.
    from onnxruntime.quantization import QuantType, quantize_dynamic

    onnx_dir = out / "onnx"
    onnx_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(tmp / "model.onnx", onnx_dir / "model.onnx")
    quantize_dynamic(str(tmp / "model.onnx"), str(onnx_dir / "model_quantized.onnx"), weight_type=QuantType.QInt8)

    for f in tmp.iterdir():
        if f.suffix == ".json" or f.name.endswith(".txt"):
            shutil.copy(f, out / f.name)
    shutil.rmtree(tmp)

    # 3. Sanity-check the vocabulary: Polish letters, word separator and blank/pad must be present.
    vocab_path = out / "vocab.json"
    if vocab_path.exists():
        vocab = json.loads(vocab_path.read_text(encoding="utf-8"))
        letters = {k for k in vocab if len(k) == 1 and k.isalpha()}
        missing = EXPECTED - letters
        if missing:
            print(f"! UWAGA: w słowniku brakuje liter: {''.join(sorted(missing))}")
        for special in ("<pad>", "|"):
            if special not in vocab:
                print(f"! UWAGA: brak symbolu {special!r} w słowniku")
        print(f"Słownik: {len(vocab)} symboli, blank = <pad> (id {vocab.get('<pad>')})")

    size = sum(p.stat().st_size for p in onnx_dir.iterdir()) / 1e6
    print(f"Gotowe: {out} ({size:.0f} MB w onnx/)")

    if args.push:
        from huggingface_hub import HfApi

        api = HfApi()
        api.create_repo(args.push, exist_ok=True)
        api.upload_folder(folder_path=str(out), repo_id=args.push)
        print(f"Wysłano do https://huggingface.co/{args.push}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
