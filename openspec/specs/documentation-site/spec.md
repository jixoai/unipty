# documentation-site Specification

## Purpose
Publish static UniPty documentation and exact compatibility evidence without
creating a browser PTY runtime, a Core dependency, or a second evidence source.

## Requirements

### Requirement: Static site and runtime isolation

The system SHALL provide private workspace `packages/www` as a static official
documentation site. It SHALL not import native Backend entry modules into a
browser bundle, execute local PTY operations in a browser, define Core contract
behaviour, or become a runtime dependency of Core or Backend packages.

#### Scenario: Browser visitor cannot trigger local Backend acquisition

- **WHEN** a visitor views the official site
- **THEN** the site renders documentation and examples without dynamically
  importing or initializing a native Backend

### Requirement: Immutable catalog presentation

The site build SHALL accept an explicitly selected release catalog artifact,
validate it, and copy it unchanged into static output. It SHALL present only
`verified`, `declared-unverified`, and `not-targeted` states from exact release
metadata and evidence; it SHALL not merge catalog history, re-run probes, widen
runtime versions, or turn absent evidence into support.

#### Scenario: Missing evidence is displayed conservatively

- **WHEN** a released target declaration matches a tuple without exact evidence
- **THEN** the site displays declared-unverified and does not label the tuple as
  supported or verified

### Requirement: GitHub Pages and custom domain ownership

The site SHALL deploy as static output through GitHub Pages. The repository
deployment workflow SHALL treat `unipty.jixoai.com` DNS CNAME mapping as Owner-
managed external configuration and SHALL not require Core or Backend publication
to wait for a site deployment retry.

#### Scenario: A site deployment retry does not republish packages

- **WHEN** package release and catalog attachment have succeeded but GitHub Pages
  deployment fails
- **THEN** the site deployment can be retried from the explicit release artifact
  without republishing Core or Backend packages

### Requirement: Implementation-time visual reference

The website implementation SHALL use the sibling `../openspecui` official site
as its visual reference at implementation time. It SHALL inspect that project
when implementation begins and SHALL not make it a source dependency, git
submodule, build input, or constraint on the Core/Backend package graph.

#### Scenario: Website styling remains operationally independent

- **WHEN** the OpenSpecUI project is unavailable to a deployed website build
- **THEN** the UniPty site still builds from its own workspace assets and release
  artifact without resolving a sibling source dependency
