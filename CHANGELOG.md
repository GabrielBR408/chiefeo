# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Copyright notice HTML comment at the top of `index.html`.
- `LICENSE` file declaring proprietary, all-rights-reserved terms under Golden Real Estate Ventures and Exchanges LLC.

### Changed
- Sanitized `console.error` calls to log only `e?.message` and `e?.code` instead of full error objects, reducing the risk of accidentally surfacing network metadata or sensitive fields in browser DevTools.
