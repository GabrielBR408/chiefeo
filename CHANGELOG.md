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

### Security
- Added Subresource Integrity (`integrity` + `crossorigin="anonymous"`) to all CDN-loaded `<script src>` tags (React 18.2.0, ReactDOM 18.2.0, Babel Standalone 7.23.9). Hashes are sha384 and were computed from the official npm tarballs that cdnjs mirrors, so a tampered or substituted CDN payload will be rejected by the browser. Note: the Supabase ESM bundle is loaded via a JavaScript `import` statement (not a `<script src>` tag), where SRI is not currently expressible via attribute and is therefore tracked as a separate concern.
