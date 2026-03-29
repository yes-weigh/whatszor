#!/bin/bash
set -e

# --- Whatszor Database Backup Script ---
# Performs a streaming compressed backup of the PostgreSQL database
# and uploads it to S3 (if configured).

# Load environment variables if .env exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Configuration
DB_URL=${DATABASE_URL}
BACKUP_DIR=${BACKUP_DIR:-./backups/postgres}
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="whatszor_db_${TIMESTAMP}.sql.gz"
LOCAL_PATH="${BACKUP_DIR}/${FILENAME}"
S3_PATH="s3://${S3_BUCKET}/backups/postgres/${FILENAME}"

# Ensure local backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "Starting database backup: ${FILENAME}"

# 1. Perform streaming pg_dump | gzip
# We use --no-owner and --no-acl to make restores easier across different environments.
echo "Dumping and compressing..."
pg_dump "${DB_URL}" --no-owner --no-privileges | gzip > "${LOCAL_PATH}.tmp"

# Atomic rename to final local path
mv "${LOCAL_PATH}.tmp" "${LOCAL_PATH}"
echo "Local backup completed: ${LOCAL_PATH}"

# 2. Upload to S3 if configured
if [ -n "${S3_BUCKET}" ]; then
  echo "Uploading to S3: ${S3_PATH}..."
  
  # Ensure AWS CLI is available or skip
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "${LOCAL_PATH}" "${S3_PATH}" --region "${S3_REGION:-us-east-1}"
    echo "S3 upload successful."
    
    # Optional: Remove local file after successful upload if you want to save space
    # rm "${LOCAL_PATH}"
  else
    echo "WARNING: S3_BUCKET is set but 'aws' CLI was not found. Skipping S3 upload."
  fi
else
  echo "S3 not configured (S3_BUCKET missing). Backup remains stored locally."
fi

# 3. Retention policy: Keep last 7 days locally (optional)
find "${BACKUP_DIR}" -name "whatszor_db_*.sql.gz" -mtime +7 -delete

echo "Backup process finished."
