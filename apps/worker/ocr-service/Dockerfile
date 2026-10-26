FROM rust:1.97-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends libtesseract-dev libswscale-dev pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY apps/worker/ocr-service/Cargo.toml apps/worker/ocr-service/Cargo.lock apps/worker/ocr-service/build.rs ./
COPY apps/worker/ocr-service/src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libtesseract5 tesseract-ocr-eng ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 ocr
COPY --from=builder /service/target/release/lovat-ocr-service /usr/local/bin/lovat-ocr-service
USER ocr
ENV OMP_THREAD_LIMIT=1
ENV OCR_BIND_HOST=::
EXPOSE 8080
CMD ["lovat-ocr-service"]
