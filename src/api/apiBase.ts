/**
 * Prefix every 0xDeck backend route is mounted under (FastAPI mounts its
 * routers on `/api/...`). Kept in one module so the market path builders and
 * the route-contract test cannot drift apart.
 */
export const API_BASE = '/api'
