"""Setup for health-models-tui Azure CLI extension."""
from setuptools import setup, find_packages

VERSION = "0.3.0"

CLASSIFIERS = [
    "Development Status :: 3 - Alpha",
    "Intended Audience :: Developers",
    "Intended Audience :: System Administrators",
    "Programming Language :: Python",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "License :: OSI Approved :: MIT License",
]

DEPENDENCIES = [
    "textual==8.2.8",
    "rich>=15.0.0,<16.0.0",
    "azure-core>=1.41.0,<2.0.0",
    "azure-mgmt-cloudhealth==1.0.0b5",
]

setup(
    name="health-models-tui",
    version=VERSION,
    description="Azure CLI extension that launches the Health Models terminal monitor",
    long_description="Launch the Textual and plain health monitor for Azure Monitor Health Models.",
    license="MIT",
    author="Always-On Team",
    classifiers=CLASSIFIERS,
    packages=find_packages(exclude=[
        "tests",
        "tests.*",
        "*.tests",
        "*.tests.*",
        "azext_health_models_tui.tests",
        "azext_health_models_tui.tests.*",
    ]),
    package_data={"azext_health_models_tui": ["py.typed", "watch/styles.tcss"]},
    install_requires=DEPENDENCIES,
    python_requires=">=3.10",
)
