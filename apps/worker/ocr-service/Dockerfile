FROM rust:1.97-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends libtesseract-dev libswscale-dev pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY apps/worker/ocr-service/Cargo.toml apps/worker/ocr-service/Cargo.lock apps/worker/ocr-service/build.rs ./
COPY apps/worker/ocr-service/src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim AS model
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
# These bytes match the audited Railway/local model. Keep the registry and build
# contract in test/ocr-models.test.ts in sync when deliberately changing weights.
RUN mkdir /model && \
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata -o /model/eng.traineddata && \
    echo '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2  /model/eng.traineddata' | sha256sum --check && \
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/LICENSE -o /model/LICENSE && \
    echo 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30  /model/LICENSE' | sha256sum --check

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libtesseract5 ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 ocr
COPY --from=builder /service/target/release/lovat-ocr-service /usr/local/bin/lovat-ocr-service
COPY --from=model /model /opt/ocr-model
USER ocr
ENV OMP_THREAD_LIMIT=1
ENV TESSDATA_PREFIX=/opt/ocr-model
ENV OCR_EXPECTED_MODEL_SHA256=7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2
ENV OCR_BIND_HOST=::
EXPOSE 8080
CMD ["lovat-ocr-service"]
