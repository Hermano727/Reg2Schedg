# TritonHub worker

Placeholder for async jobs: long-running ingest, parsing, embeddings, and agent/browser tasks triggered by the API.

Intended stack (to be decided): queue (e.g. Redis + RQ/Celery) or hosted worker on Render/Railway calling the same Postgres and external APIs as `services/api`.
