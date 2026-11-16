// Return fixed messages only: driver errors can contain connection credentials.
export function databaseFailureMessage(error) {
  const errors = []
  const seen = new Set()
  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    errors.push(value)
    visit(value.cause)
    if (value.reason?.servers instanceof Map) {
      for (const server of value.reason.servers.values()) visit(server.error)
    }
  }
  visit(error)
  if (errors.some(e => e.code === 18 || e.codeName === 'AuthenticationFailed')) {
    return 'MongoDB authentication failed. Check the database username, password (URL-encoded in the URI), and authSource in MONGODB_URI.'
  }
  if (errors.some(e => /TLS|SSL|CERT/i.test(`${e.code || ''} ${e.message || ''}`))) {
    return 'MongoDB TLS connection failed. Check Atlas cluster availability and Network Access for this environment. Vercel builds and functions need permitted outbound IPs; if using Static IPs, enable Use for builds. Verify the Atlas Drivers connection string in MONGODB_URI. Keep TLS certificate verification enabled.'
  }
  if (errors.some(e => /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|querySrv|server selection/i.test(`${e.code || ''} ${e.message || ''}`) || e.name === 'MongoServerSelectionError')) {
    return 'MongoDB could not be reached. Check MONGODB_URI, DNS, cluster availability, and the Atlas IP access list for this environment. A local connection succeeding does not verify Vercel network access.'
  }
  return 'MongoDB operation failed. Check database configuration, user permissions, and cluster availability. Connection details were omitted to protect credentials.'
}
