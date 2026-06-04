
## Untuk folder FE: `KESH-KYC/CLAUDE.md`

Isi dengan ini:

```md
# KESH KYC Frontend Context

This is the frontend admin app for KYC/KYB PJP 3.

## Stack

- Next.js
- TypeScript
- Frontend only
- Backend folder is sibling: `../kesh-kyb-kyc-be`

Do not patch backend from this folder unless explicitly requested.

## Backend API

Backend base URL should come from environment variable:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api