FROM python:3.12-alpine

RUN apk add --no-cache docker-cli
WORKDIR /app
COPY docker-health-exporter.py /app/docker-health-exporter.py
EXPOSE 9108
CMD ["python3", "/app/docker-health-exporter.py"]
