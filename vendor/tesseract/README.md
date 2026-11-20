# Vendored OCR (scale-bar label reading)

- `tesseract.min.js`, `worker.min.js`: tesseract.js 7.0.0, Apache-2.0 (LICENSE-tesseract.js.md)
- `tesseract-core-*-lstm.wasm.js`: tesseract.js-core 6.1.2 (WebAssembly build of Tesseract OCR), Apache-2.0 (LICENSE-tesseract.js-core.txt)
- `lang/eng.traineddata.gz`: English LSTM model (tessdata_best, integer) from @tesseract.js-data/eng 1.0.0, MIT package wrapping Tesseract's Apache-2.0 trained data

Loaded only when the app reads a scale bar; runs locally in the browser.
