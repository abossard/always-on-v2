"""Setup for az healthmodel CLI extension."""
from setuptools import setup, find_packages

VERSION = "0.1.0"

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
    "textual>=0.50.0",
]

setup(
    name="az-healthmodel",
    version=VERSION,
    description="Azure CLI extension for Azure Monitor Health Models (Microsoft.CloudHealth)",
    long_description="CRUD commands and live watch TUI for Azure Monitor Health Models.",
    license="MIT",
    author="Always-On Team",
    classifiers=CLASSIFIERS,
    packages=find_packages(exclude=["tests"]),
    package_data={"azext_healthmodel": ["py.typed", "watch/styles.tcss"]},
    install_requires=DEPENDENCIES,
    python_requires=">=3.10",
)
