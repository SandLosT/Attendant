export function ownerAuth(req, res, next) {
  const expectedToken = process.env.OWNER_AUTH_TOKEN;
  const authHeader = req.get('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (!expectedToken) return res.status(500).json({ erro: 'OWNER_AUTH_TOKEN não configurado' });
  if (scheme !== 'Bearer' || token !== expectedToken) return res.status(401).json({ erro: 'Não autorizado' });
  return next();
}
