// static/js/api.js

async function apiGet(url) {
  const res = await fetch(url);
  return await res.json();
}

async function apiPost(url, body, isFormData = false) {
  const options = { method: 'POST' };

  if (isFormData) {
    options.body = body;
  } else {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  return await res.json();
}

async function apiPut(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  return await res.json();
}