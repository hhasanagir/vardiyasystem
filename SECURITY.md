# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅ Active |

## Reporting a Vulnerability

Report security vulnerabilities to the project maintainers via email or GitHub Issues. Do not disclose vulnerabilities publicly until a fix has been released.

## Security Measures

- JWT-based authentication with configurable secret
- Passwords hashed with bcrypt
- Role-based access control (RBAC) on all API endpoints
- Validation pipes strip unknown fields from API requests
- Environment variables for all secrets — never hardcoded
- `.env` files excluded from version control via `.gitignore`
