# Implement our own auth system
There are some things that I don't like about better-auth.
In general, I would say it is a pretty nice library, but it clashes with some ideas/requirements I have for Apollo.

In some ways, it is not flexible enough, when I want to deviate from the documented way of doing things.

So we implement our own auth system at a later time, maybe taking some inspiration from better-auth's feature list.

## Notes
* Auth 'entrypoints'
  * Session cookie
    * Probably also needs to work for WebSocket connections
  * Authorization header (API token)
* Login via OAuth providers (GitHub, Microsoft, ...)
  * Has to be generic to essentially support all providers
  * Has predefined providers for convenience (GitHub, Microsoft, Google, ...)
  * Maybe we can support OpenID Connect for autoconfiguration?
  * Account creation should be explicitly 'opt-in' in case a user logs in with another provider by accident
    * We can display a simple 'finish account creation page', which has some token to 'claim' the account, instead of instantly creating one
      * idea: There is no active session yet, no account actually exists yet, but the user clicking on a button sends all info we need to finish the login
* A user can be connected to multiple OAuth providers
  * Each provider has its info stored in the DB (e.g. account id, email, name, avatar url, ...)
* Every session is linked to a user
* Tokens etc. are stored securely (hashed, encrypted, ...)
* 2FA support
* Account creation can be disabled by the admin
* Admin can invite someone to create an account
  * Essentially a link, that he can share or Apollo can send an invite-email
* A user can list and revoke all/some active sessions
