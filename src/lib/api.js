import { auth } from "./firebase.js";

export async function callApi(path, body = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to continue.");
  const token = await user.getIdToken();

  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    // A non-JSON body means the SPA rewrite swallowed the request.
    throw new Error("The server did not respond correctly. Check the /api routing.");
  }
  if (!res.ok) throw new Error(payload.error || "Something went wrong. Try again.");
  return payload;
}
