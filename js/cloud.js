// Supabase cloud storage and authentication module
const Cloud = {
  supabase: null,
  user: null,
  syncInProgress: false,
  syncQueue: [],
  syncTimer: null,
  _cachedTier: 'free',
  _cachedIsAdmin: false,

  // --- Tier System ---
  TIER_RANK: { free: 0, standard: 1, pro: 2 },

  FEATURE_TIERS: {
    campaign_notes:   'standard',
    cloud_sync:       'standard',
    import_export:    'standard',
    battle_log:       'pro',
    treasury_ledger:  'pro',
    warrior_names:    'standard',
    custom_warriors:  'pro',
    pdf_export:       'pro',
  },

  getTier() {
    return this.isSignedIn() ? this._cachedTier : 'free';
  },

  isPro()      { return this.getTier() === 'pro'; },
  isStandard() { return this.getTier() === 'standard'; },
  isAdmin()    { return this.isSignedIn() && this._cachedIsAdmin; },

  canAccess(feature) {
    const required = this.FEATURE_TIERS[feature] || 'free';
    return (this.TIER_RANK[this.getTier()] || 0) >= (this.TIER_RANK[required] || 0);
  },

  getMaxRosters() {
    const tier = this.getTier();
    if (tier === 'pro') return Infinity;
    if (tier === 'standard') return 10;
    return 3;
  },

  async refreshTier() {
    if (!this.supabase || !this.user) { this._cachedTier = 'free'; this._cachedIsAdmin = false; return; }
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.access_token) {
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]));
        this._cachedTier = payload.user_tier || 'free';
        this._cachedIsAdmin = payload.is_admin === true;
      } catch (e) { this._cachedTier = 'free'; this._cachedIsAdmin = false; }
    }
  },

  // --- Configuration ---
  SUPABASE_URL: 'https://suwlelsqreokrdqoeikf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1d2xlbHNxcmVva3JkcW9laWtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODIxMDAsImV4cCI6MjA4ODA1ODEwMH0.0ntIwT1jXaRY9_GcnTmI6joPVw_hkrNTl18Crt-tbcI',

  // --- Initialization ---
  init() {
    if (typeof window.supabase === 'undefined') {
      console.warn('Supabase SDK not loaded — running in offline mode');
      return;
    }

    this.supabase = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);

    // Listen for auth state changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      const wasSignedIn = !!this.user;
      this.user = session?.user || null;

      if (event === 'SIGNED_IN' && !wasSignedIn) {
        this.onSignIn();
      } else if (event === 'SIGNED_OUT') {
        this.onSignOut();
      } else if (event === 'TOKEN_REFRESHED') {
        this.refreshTier().then(() => {
          if (typeof UI !== 'undefined' && UI.renderAuthState) UI.renderAuthState();
        });
      }

      if (typeof UI !== 'undefined' && UI.renderAuthState) {
        UI.renderAuthState();
      }
    });

    // Check for existing session (page reload / OAuth redirect return)
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this.user = session?.user || null;
      if (this.user) this.refreshTier();
      if (typeof UI !== 'undefined' && UI.renderAuthState) {
        UI.renderAuthState();
      }
    });
  },

  isSignedIn() {
    return !!this.user;
  },

  getUserEmail() {
    return this.user?.email || null;
  },

  getUserName() {
    return this.user?.user_metadata?.full_name || this.user?.email || null;
  },

  getUserAvatar() {
    return this.user?.user_metadata?.avatar_url || null;
  },

  // --- Auth ---
  async signIn(email, password) {
    if (!this.supabase) {
      if (typeof UI !== 'undefined') UI.toast('Cloud service unavailable', 'error');
      return false;
    }

    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Sign-in error:', error);
      if (typeof UI !== 'undefined') UI.toast('Sign-in failed: ' + error.message, 'error');
      return false;
    }
    return true;
  },

  async signUp(email, password) {
    if (!this.supabase) {
      if (typeof UI !== 'undefined') UI.toast('Cloud service unavailable', 'error');
      return false;
    }

    const { error } = await this.supabase.auth.signUp({ email, password });
    if (error) {
      console.error('Sign-up error:', error);
      if (typeof UI !== 'undefined') UI.toast('Sign-up failed: ' + error.message, 'error');
      return false;
    }
    if (typeof UI !== 'undefined') UI.toast('Account created! Check your email to confirm.', 'success');
    return true;
  },

  async signOut() {
    if (!this.supabase) return;
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      console.error('Sign-out error:', error);
    }
    this.user = null;
    this._cachedTier = 'free';
    this._cachedIsAdmin = false;
    this.syncQueue = [];
    clearTimeout(this.syncTimer);
  },

  // --- Sign-in / Sign-out handlers ---
  async onSignIn() {
    await this.refreshTier();
    if (typeof UI !== 'undefined') {
      UI.toast('Signed in as ' + this.getUserName(), 'success');
      UI.renderAuthState();
    }
    if (this.canAccess('cloud_sync')) {
      await this.fullSync();
    }
  },

  onSignOut() {
    this._cachedTier = 'free';
    this._cachedIsAdmin = false;
    if (typeof UI !== 'undefined') {
      UI.toast('Signed out. Your rosters remain saved locally.', 'info');
      UI.renderAuthState();
      UI.renderRosterList();
    }
  },

  // --- Cloud CRUD (fire-and-forget from Storage.js) ---

  enqueueSave(roster) {
    if (!this.isSignedIn() || !this.supabase || !this.canAccess('cloud_sync')) return;

    // Deduplicate by ID
    if (!this.syncQueue.includes(roster.id)) {
      this.syncQueue.push(roster.id);
    }

    // Debounce: flush after 2 seconds of inactivity
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.flushSyncQueue(), 2000);

    if (typeof UI !== 'undefined' && UI.renderSyncIndicator) {
      UI.renderSyncIndicator('syncing');
    }
  },

  async flushSyncQueue() {
    if (!this.isSignedIn() || this.syncQueue.length === 0) return;

    const idsToSync = [...this.syncQueue];
    this.syncQueue = [];

    for (const id of idsToSync) {
      const roster = Storage.getRoster(id);
      if (roster) {
        await this.upsertRoster(roster);
      }
    }

    if (typeof UI !== 'undefined' && UI.renderSyncIndicator) {
      UI.renderSyncIndicator('synced');
    }
  },

  async upsertRoster(roster) {
    const { error } = await this.supabase.from('rosters').upsert({
      id: roster.id,
      user_id: this.user.id,
      data: roster,
      updated_at: roster.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });

    if (error) {
      console.error('Cloud save failed for', roster.id, error);
      // Re-queue for retry
      if (!this.syncQueue.includes(roster.id)) {
        this.syncQueue.push(roster.id);
      }
    }
  },

  async deleteRoster(id) {
    if (!this.isSignedIn() || !this.supabase) return;
    const { error } = await this.supabase.from('rosters').delete().eq('id', id);
    if (error) console.error('Cloud delete failed:', error);
  },

  async fetchAllRosters() {
    if (!this.isSignedIn() || !this.supabase) return [];
    const { data, error } = await this.supabase
      .from('rosters')
      .select('id, data, updated_at')
      .eq('user_id', this.user.id);

    if (error) {
      console.error('Cloud fetch failed:', error);
      return [];
    }
    return data || [];
  },

  // --- Notifications (public, no auth required) ---
  async fetchActiveNotifications() {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from('notifications')
      .select('id, message, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch notifications:', error);
      return [];
    }
    return data || [];
  },

  // --- Full Sync (runs on sign-in) ---
  async fullSync() {
    if (this.syncInProgress || !this.isSignedIn()) return;
    this.syncInProgress = true;

    if (typeof UI !== 'undefined' && UI.renderSyncIndicator) {
      UI.renderSyncIndicator('syncing');
    }

    try {
      const cloudRows = await this.fetchAllRosters();
      const localRosters = Storage.getAllRosters();

      const cloudMap = {};
      for (const row of cloudRows) {
        cloudMap[row.id] = row;
      }
      const localMap = {};
      for (const r of localRosters) {
        localMap[r.id] = r;
      }

      const merged = [];
      const allIds = new Set([...Object.keys(cloudMap), ...Object.keys(localMap)]);

      for (const id of allIds) {
        const local = localMap[id];
        const cloud = cloudMap[id];

        if (local && !cloud) {
          // Local only — upload to cloud (migration / new roster)
          merged.push(local);
          await this.upsertRoster(local);
        } else if (cloud && !local) {
          // Cloud only — download to local
          merged.push(cloud.data);
        } else if (local && cloud) {
          // Both exist — last-write-wins
          const localTime = new Date(local.updatedAt || 0).getTime();
          const cloudTime = new Date(cloud.updated_at || 0).getTime();
          if (localTime >= cloudTime) {
            merged.push(local);
            if (localTime > cloudTime) {
              await this.upsertRoster(local);
            }
          } else {
            merged.push(cloud.data);
          }
        }
      }

      // Write merged result to localStorage
      Storage.saveAllRosters(merged);

      // Re-render UI
      if (typeof UI !== 'undefined') {
        if (UI.currentRoster) {
          // If editing a roster, refresh it from the merged data
          const updated = merged.find(r => r.id === UI.currentRoster.id);
          if (updated) {
            UI.currentRoster = updated;
            UI.renderRosterEditor();
          }
        }
        UI.renderRosterList();
        UI.renderSyncIndicator('synced');
      }

    } catch (err) {
      console.error('Sync failed:', err);
      if (typeof UI !== 'undefined') {
        UI.renderSyncIndicator('error');
        UI.toast('Cloud sync failed. Your local data is safe.', 'error');
      }
    } finally {
      this.syncInProgress = false;
    }
  }
};
