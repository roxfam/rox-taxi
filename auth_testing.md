# Auth Testing Playbook (Emergent Managed Google Auth)

## Create test user & session

```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Test API

```bash
curl -H "Authorization: Bearer $TOKEN" $API/api/auth/me
curl -H "Authorization: Bearer $TOKEN" $API/api/my/bookings
```

## Notes
- Admin login is separate (JWT via `/api/auth/login`) — Google auth is customer-only.
- Session cookies use `httpOnly`, `secure=True`, `samesite=None`, `path=/`.
- `/api/auth/me` returns user data or 401.
- Customer bookings link via `customer_email` matching Google account email.
