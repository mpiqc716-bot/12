# Firebase Security Spec

## 1. Data Invariants
1. Only authenticated operators or admins can access pipe manufacturing track records.
2. Step changes require structural validations (e.g. valid step sequence numbers and non-empty quality checks).
3. Admin permissions are required to dispatch completed pipes or manage project tolerances and parameters.
4. Users cannot modify their own security role parameters to escalate privileges.

## 2. The "Dirty Dozen" Attack Payloads (Attempts to bypass laws)
1. **Unauthenticated Read Request to Pipes Collection** (Ident: `UNAUTH_READ_PIPE`): Allowed: `false`.
2. **Anonymous Write Request to Users Collection** (Ident: `UNAUTH_CREATE_USER`): Allowed: `false`.
3. **Escalated Privileges Profile Setup** (Ident: `SPOOF_ADMIN_ROLE`): An operator attempts to create a user profile with role `admin` directly. Allowed: `false`.
4. **Self-Update of Restricted Role Parameter** (Ident: `SPOOF_UPDATE_ROLE`): A regular operator attempts to modify their role to `admin` in Firestore on their profile. Allowed: `false`.
5. **Unauthorized Modification of Another Operator's Pipe** (Ident: `SPOOF_TAKEOVER_PIPE`): Allowed: `false` (Unless done by Admin).
6. **Bypassing Step Limits with Bad stepNo** (Ident: `POISON_STEP_NUMBER`): Allowed: `false`.
7. **Bypassing Dispatch Restrictions** (Ident: `UNAUTH_DISPATCH_PIPE`): Operators bypassing admin dispatch control. Allowed: `false`.
8. **Resource Exhaustion Attack via Giant ID** (Ident: `DOTW_ID_RESOURCES`): An ID consisting of a 1MB string sequence. Allowed: `false`.
9. **Tampering with Time Series via Fake Timestamps** (Ident: `SPOOF_TIME_STAMP`): Client self-asserting legacy timestamps values. Allowed: `false`.
10. **Orphaned Pipe with Invalid Project ID** (Ident: `ORPHANED_RECORD_CREATE`): Allowed: `false`.
11. **Malicious Inject of Null values to Required Fields** (Ident: `MALFORMED_PIPE_METADATA`): Allowed: `false`.
12. **Malicious Query Scraping in Chat Archive** (Ident: `SCRAPING_CHAT_LOG`): Unauthenticated query access sweep. Allowed: `false`.

## 3. The Firebase Security Rules Test Runner Setup
The complete security layout testing is implemented via standard security rule matching gates, where each collection validation logic rejects any untrusted client mutations.
