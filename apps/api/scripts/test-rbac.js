async function testRoles() {
    const baseUrl = 'http://localhost:3001/api/v1'; 
    let adminToken, memberToken, viewerToken;

    // 1. Authenticate users
    const users = ['admin', 'member', 'viewer'];
    const tokens = {};
    for (const u of users) {
        try {
            const res = await fetch(`${baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: `${u}@test.com`, password: 'password123', workspaceSlug: 'yesweigh' })
            });
            const data = await res.json();
            if (data.data?.accessToken) {
                tokens[u] = data.data.accessToken;
            } else {
                console.error(`Login failed for ${u}:`, data);
            }
        } catch(e) { console.error(`Network error for ${u}: ${e.message}`); }
    }

    const authHeaders = (token) => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    });

    console.log("--- PHASE 3: RBAC VERIFICATION ---");

    // TEST 1: ADMIN abilities
    let adminReq = await fetch(`${baseUrl}/crm/contacts`, {
        method: 'POST',
        headers: authHeaders(tokens.admin),
        body: JSON.stringify({ firstName: 'AdminContact', phone: '+999999999' })
    });
    if (adminReq.ok) console.log("✅ Admin can create contacts");
    else console.log(`❌ Admin contact creation failed: ${adminReq.status} - ${await adminReq.text()}`);

    // TEST 2: MEMBER abilities
    let contactId;
    let memberReq = await fetch(`${baseUrl}/crm/contacts`, {
        method: 'POST',
        headers: authHeaders(tokens.member),
        body: JSON.stringify({ firstName: 'MemberContact', phone: '+888888888' })
    });
    if (memberReq.ok) {
        const memberData = await memberReq.json();
        contactId = memberData.data?.id;
        console.log("✅ Member can create contacts");
    } else {
        console.log(`❌ Member contact creation failed: ${memberReq.status}`);
    }

    if (contactId) {
        let memberDelReq = await fetch(`${baseUrl}/crm/contacts/${contactId}`, {
            method: 'DELETE',
            headers: authHeaders(tokens.member)
        });
        if (memberDelReq.status === 403) console.log("✅ Member FORBIDDEN from deleting contacts");
        else console.log(`❌ Member delete error mismatch: ${memberDelReq.status}`);
    }

    // TEST 3: VIEWER abilities
    let viewerReq = await fetch(`${baseUrl}/campaigns`, {
        method: 'POST',
        headers: authHeaders(tokens.viewer),
        body: JSON.stringify({ name: 'Viewer Campaign', type: 'BROADCAST' })
    });
    if (viewerReq.status === 403) console.log("✅ Viewer FORBIDDEN from creating campaigns");
    else console.log(`❌ Viewer campaign error mismatch: ${viewerReq.status}`);
}

testRoles().catch(console.error);
