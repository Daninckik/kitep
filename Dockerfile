FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       tesseract-ocr tesseract-ocr-rus tesseract-ocr-kir djvulibre-bin \
    && rm -rf /var/lib/apt/lists/*

# Tesseract не должен плодить свои потоки — параллелим сами по страницам
ENV OMP_THREAD_LIMIT=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py analyzer.py rules.py extractors.py \
     db.py auth.py permissions.py state_pages.py standards_seed.py \
     books_api.py ai_api.py stats_api.py admin_api.py scans_api.py ai_writer.py ./
COPY static/ static/

EXPOSE 8077

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8077"]
