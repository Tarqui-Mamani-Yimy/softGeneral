from pathlib import Path
from fastapi import HTTPException


def get_contained_file(
    storage_dir: str | Path,
    candidate_path: str | Path | None,
    missing_detail: str = "File not found",
) -> Path:
    """Validates that candidate_path exists, is a regular file, and resides strictly inside storage_dir."""
    if not candidate_path:
        raise HTTPException(status_code=404, detail=missing_detail)
    storage_root = Path(storage_dir).resolve()
    # Relative paths (alert evidence) are relative to STORAGE_DIR, never to the
    # process working directory. Absolute paths (video outputs) are kept as is.
    resolved_path = (storage_root / candidate_path).resolve()
    try:
        resolved_path.relative_to(storage_root)
    except ValueError:
        raise HTTPException(status_code=404, detail=missing_detail) from None
    if not resolved_path.is_file():
        raise HTTPException(status_code=404, detail=missing_detail)
    return resolved_path
