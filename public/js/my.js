const API = '/api';
let token = null;
let currentUser = null;
let rentals = [];

// DOM
const userInfoEl = document.getElementById('user-info');
const emailEl = document.getElementById('user-email');
const passEl = document.getElementById('user-pass');
const btnLogin = document.getElementById('btn-login');
const filterStatusEl = document.getElementById('filter-status');
const btnReload = document.getElementById('btn-reload');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');

function setUserInfo() {
  if (currentUser) {
    userInfoEl.textContent = `${currentUser.name} (${currentUser.email})`;
    userInfoEl.style.color = '#22c55e';
  } else {
    userInfoEl.textContent = 'Не авторизован';
    userInfoEl.style.color = '#9ca3af';
  }
}

async function login() {
  const email = emailEl.value.trim();
  const password = passEl.value.trim();
  if (!email || !password) {
    alert('Введите email и пароль');
    return;
  }

  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.message || 'Ошибка входа');
    return;
  }

  token = data.token;
  currentUser = { name: data.name, role: data.role, email: data.email };
  setUserInfo();
  await loadRentals();
}

async function loadRentals() {
  if (!token) {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'Сначала войдите, чтобы увидеть свои покупки и аренды.';
    listEl.innerHTML = '';
    return;
  }

  const res = await fetch(`${API}/my/rentals`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Ошибка загрузки списка');
    return;
  }

  rentals = data;
  render();
}

function render() {
  listEl.innerHTML = '';

  if (!rentals || rentals.length === 0) {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'У вас пока нет заказов. Оформите покупку или аренду на главной странице.';
    return;
  }

  emptyEl.style.display = 'none';

  const filter = filterStatusEl.value;
  const now = new Date();

  const filtered = rentals.filter(r => {
    const isBuy = r.type === 'buy';
    const isRent = r.type === 'rent';
    const status = (r.status || '').toLowerCase();

    if (filter === 'buy') return isBuy;
    if (filter === 'rent') return isRent;
    if (filter === 'active') {
      if (isBuy) return true;
      if (isRent) {
        if (!r.end_date) return true;
        return new Date(r.end_date) >= now && status === 'active';
      }
    }
    if (filter === 'expired') {
      if (isRent && r.end_date) {
        return new Date(r.end_date) < now || status === 'expired' || status === 'completed';
      }
      return status === 'completed' || status === 'expired';
    }
    return true; // all
  });

  if (!filtered.length) {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'По выбранному фильтру заказов нет.';
    return;
  }

  filtered.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card';

    const isBuy = r.type === 'buy';
    const isRent = r.type === 'rent';
    const start = r.start_date ? new Date(r.start_date) : null;
    const end = r.end_date ? new Date(r.end_date) : null;
    const status = (r.status || '').toLowerCase();

    let statusClass = 'completed';
    if (isBuy) {
      statusClass = 'completed';
    } else if (isRent && end) {
      if (end < now) statusClass = 'expired';
      else if (status === 'active') statusClass = 'active';
      else statusClass = 'completed';
    } else if (status === 'active') {
      statusClass = 'active';
    }

    const typeLabel = isBuy
      ? 'Покупка (навсегда)'
      : `Аренда (${r.period || 'период не указан'})`;

    // Остаток дней
    let leftHtml = '';
    if (isRent && end) {
      const diffMs = end - now;
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (days > 0) {
        const cls = days <= 3 ? 'danger' : 'ok';
        leftHtml = `<div class="left-line ${cls}">Осталось дней: ${days}</div>`;
      } else {
        leftHtml = `<div class="left-line danger">Срок аренды истёк</div>`;
      }
    }

    const fmt = d =>
      !d
        ? '—'
        : `${String(d.getDate()).padStart(2, '0')}.${String(
            d.getMonth() + 1
          ).padStart(2, '0')}.${d.getFullYear()}`;

    card.innerHTML = `
      <div class="card-title">${r.title || 'Без названия'}</div>
      <div class="card-author">${r.author || ''}</div>

      <div class="badge-type">
        <span>${isBuy ? '🛒' : '📖'}</span>
        <span>${typeLabel}</span>
      </div>

      <div class="badge-status ${statusClass}">
        ${statusClass === 'active' ? 'АКТИВНО' : ''}
        ${statusClass === 'completed' ? 'ЗАВЕРШЕНО' : ''}
        ${statusClass === 'expired' ? 'ИСТЕКЛО' : ''}
      </div>

      <div class="meta-line">
        Цена: ${r.price ? r.price + ' ₽' : '—'}
      </div>

      <div class="date-line">
        Начало: ${fmt(start)}${isRent ? ` · Окончание: ${fmt(end)}` : ''}
      </div>

      ${leftHtml}
    `;

    listEl.appendChild(card);
  });
}

// События
btnLogin.onclick = login;
btnReload.onclick = () => {
  if (!token) {
    alert('Сначала войдите.');
    return;
  }
  loadRentals();
};
filterStatusEl.onchange = render;

// init
setUserInfo();
