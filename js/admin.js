// Admin panel module
const Admin = {
  supabase: null,
  user: null,
  _isAdmin: false,

  SUPABASE_URL: 'https://suwlelsqreokrdqoeikf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1d2xlbHNxcmVva3JkcW9laWtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODIxMDAsImV4cCI6MjA4ODA1ODEwMH0.0ntIwT1jXaRY9_GcnTmI6joPVw_hkrNTl18Crt-tbcI',

  init() {
    if (typeof window.supabase === 'undefined') {
      this.renderError('Supabase SDK failed to load.');
      return;
    }
    this.supabase = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);

    // Check existing session
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        this.user = session.user;
        this.checkAdminAndLoad(session);
      } else {
        this.renderSignIn();
      }
    });
  },

  checkAdminAndLoad(session) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]));
      this._isAdmin = payload.is_admin === true;
    } catch (e) {
      this._isAdmin = false;
    }

    if (!this._isAdmin) {
      this.renderUnauthorized();
      return;
    }
    this.renderLoading();
    this.loadUsers();
  },

  // --- Auth ---
  async signIn(email, password) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      document.getElementById('admin-error').textContent = error.message;
      return;
    }
    this.user = data.session.user;
    this.checkAdminAndLoad(data.session);
  },

  async signOut() {
    await this.supabase.auth.signOut();
    this.user = null;
    this._isAdmin = false;
    this.renderSignIn();
  },

  // --- Data ---
  async loadUsers() {
    const { data, error } = await this.supabase.rpc('get_all_users');
    if (error) {
      console.error('Failed to load users:', error);
      if (error.message.includes('Unauthorized')) {
        this.renderUnauthorized();
      } else {
        this.renderError('Failed to load users: ' + error.message);
      }
      return;
    }
    this.renderUserTable(data || []);
  },

  async updateTier(userId, newTier) {
    const { error } = await this.supabase
      .from('user_profiles')
      .update({ tier: newTier, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update tier:', error);
      this.showToast('Failed to update: ' + error.message, 'error');
      return;
    }
    this.showToast('Tier updated successfully', 'success');
  },

  // --- Rendering ---
  renderSignIn() {
    const root = document.getElementById('admin-root');
    root.innerHTML = `
      <div class="admin-signin">
        <h2>&#9760; Admin Sign In</h2>
        <div id="admin-error" class="error"></div>
        <input type="email" id="admin-email" placeholder="Email" autocomplete="email">
        <input type="password" id="admin-password" placeholder="Password" autocomplete="current-password">
        <button class="btn btn-primary" onclick="Admin.handleSignIn()" style="width:100%">Sign In</button>
        <p style="margin-top:1rem; font-size:0.85rem; color:var(--text-muted);">
          <a href="index.html" style="color:var(--accent);">&larr; Back to app</a>
        </p>
      </div>
    `;
    // Enter key support
    const passEl = document.getElementById('admin-password');
    if (passEl) {
      passEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Admin.handleSignIn();
      });
    }
  },

  handleSignIn() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    if (!email || !password) {
      document.getElementById('admin-error').textContent = 'Enter email and password.';
      return;
    }
    this.signIn(email, password);
  },

  renderLoading() {
    document.getElementById('admin-root').innerHTML = '<div class="loading">Loading users...</div>';
  },

  renderUnauthorized() {
    const root = document.getElementById('admin-root');
    root.innerHTML = `
      <div class="unauthorized">
        <h2>Not Authorized</h2>
        <p>Your account does not have admin access.</p>
        <p style="margin-top:1rem;">
          <button class="btn btn-sm" onclick="Admin.signOut()">Sign Out</button>
          &nbsp;
          <a href="index.html" style="color:var(--accent);">&larr; Back to app</a>
        </p>
      </div>
    `;
  },

  renderError(msg) {
    document.getElementById('admin-root').innerHTML = `<div class="unauthorized"><h2>Error</h2><p>${this.esc(msg)}</p></div>`;
  },

  renderUserTable(users) {
    const root = document.getElementById('admin-root');
    const rows = users.map(u => {
      const isAdmin = u.is_admin ? '<span class="admin-badge">Admin</span>' : '';
      const signupDate = u.signup_date ? new Date(u.signup_date).toLocaleDateString() : '—';
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never';
      return `
        <tr>
          <td>${this.esc(u.email)}${isAdmin ? ' ' + isAdmin : ''}</td>
          <td>
            <select id="tier-${u.user_id}" onchange="Admin.onTierChange('${u.user_id}', this.value)">
              <option value="free"${u.tier === 'free' ? ' selected' : ''}>Free</option>
              <option value="standard"${u.tier === 'standard' ? ' selected' : ''}>Standard</option>
              <option value="pro"${u.tier === 'pro' ? ' selected' : ''}>Pro</option>
            </select>
          </td>
          <td>${signupDate}</td>
          <td>${lastSignIn}</td>
        </tr>
      `;
    }).join('');

    root.innerHTML = `
      <div class="admin-header">
        <h1>&#9760; Admin Panel</h1>
        <div class="admin-info">
          <span>${this.esc(this.user.email)}</span>
          <button class="btn btn-sm" onclick="Admin.signOut()">Sign Out</button>
          <a href="index.html" class="back-link">&larr; Back to app</a>
        </div>
      </div>
      <p class="user-count">${users.length} registered user${users.length !== 1 ? 's' : ''}</p>
      <table class="user-table">
        <thead>
          <tr><th>Email</th><th>Tier</th><th>Signed Up</th><th>Last Sign In</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    this.loadNotifications();
  },

  onTierChange(userId, newTier) {
    this.updateTier(userId, newTier);
  },

  // --- Notifications ---
  async loadNotifications() {
    const { data, error } = await this.supabase.rpc('get_all_notifications');
    if (error) {
      console.error('Failed to load notifications:', error);
      return;
    }
    this.renderNotificationsSection(data || []);
  },

  renderNotificationsSection(notifications) {
    const section = document.createElement('div');
    section.id = 'notifications-section';
    section.style.marginTop = '2rem';

    const rows = notifications.map(n => {
      const date = new Date(n.created_at).toLocaleDateString();
      const status = n.is_active
        ? '<span class="status-active">Active</span>'
        : '<span class="status-inactive">Inactive</span>';
      return `
        <tr>
          <td style="max-width:400px; word-break:break-word;">${this.esc(n.message)}</td>
          <td>${status}</td>
          <td>${date}</td>
          <td>
            <button class="btn btn-sm" onclick="Admin.toggleNotification('${n.id}', ${!n.is_active})">
              ${n.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button class="btn btn-sm" style="border-color:var(--danger); color:var(--danger);" onclick="Admin.deleteNotification('${n.id}')">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const emptyRow = '<tr><td colspan="4" style="color:var(--text-muted); text-align:center;">No notifications yet.</td></tr>';

    section.innerHTML = `
      <h2 style="color:var(--accent); font-size:1.1rem; margin-bottom:1rem;">Notifications</h2>
      <div style="margin-bottom:1rem; display:flex; gap:0.5rem;">
        <input type="text" id="new-notif-message" placeholder="Enter notification message..."
          style="flex:1; padding:0.6rem 0.8rem; background:var(--bg-card); border:1px solid var(--border); color:var(--text); border-radius:4px; font-size:0.9rem; font-family:inherit;">
        <button class="btn btn-primary" onclick="Admin.createNotification()">Create</button>
      </div>
      <table class="user-table">
        <thead>
          <tr><th>Message</th><th>Status</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows || emptyRow}</tbody>
      </table>
    `;

    const existing = document.getElementById('notifications-section');
    if (existing) existing.replaceWith(section);
    else document.getElementById('admin-root').appendChild(section);
  },

  async createNotification() {
    const input = document.getElementById('new-notif-message');
    const message = input.value.trim();
    if (!message) {
      this.showToast('Enter a notification message.', 'error');
      return;
    }

    const { error } = await this.supabase
      .from('notifications')
      .insert({ message, is_active: true });

    if (error) {
      console.error('Failed to create notification:', error);
      this.showToast('Failed to create: ' + error.message, 'error');
      return;
    }

    input.value = '';
    this.showToast('Notification created.', 'success');
    this.loadNotifications();
  },

  async toggleNotification(id, newState) {
    const { error } = await this.supabase
      .from('notifications')
      .update({ is_active: newState, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      this.showToast('Failed to update: ' + error.message, 'error');
      return;
    }
    this.showToast(newState ? 'Notification activated.' : 'Notification deactivated.', 'success');
    this.loadNotifications();
  },

  async deleteNotification(id) {
    if (!confirm('Delete this notification permanently?')) return;

    const { error } = await this.supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      this.showToast('Failed to delete: ' + error.message, 'error');
      return;
    }
    this.showToast('Notification deleted.', 'success');
    this.loadNotifications();
  },

  // --- Utilities ---
  esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  showToast(message, type) {
    const existing = document.querySelector('.toast-admin');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast-admin ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
};
