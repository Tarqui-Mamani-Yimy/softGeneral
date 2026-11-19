def pytest_configure(config):
    config.addinivalue_line("markers", "models: requires the real vision model files")
