"""Vision worker entrypoint.

Runs separately from the API: it will read video jobs and camera streams,
run the models and publish alerts. For now it only proves the process starts.
"""

import logging

logger = logging.getLogger("softgeneral.worker")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logger.info("worker started")


if __name__ == "__main__":
    main()
