// UI rendering and event handling
const UI = {
  currentRoster: null,

  init() {
    this.initTheme();
    this.bindGlobalEvents();
    this.renderAuthState();
    this.showView('roster-list');
    this.renderRosterList();
  },

  // === THEME ===
  initTheme() {
    // Sync toggle icon with current theme (theme already applied by inline script)
    this.updateThemeIcon();

    // Listen for system theme changes (only when user hasn't set a preference)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('mordheim_theme')) {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
        this.updateThemeIcon();
      }
    });
  },

  toggleTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('mordheim_theme', next);
    this.updateThemeIcon();
  },

  updateThemeIcon() {
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = isDark ? '\u2600' : '\u263E'; // ☀ / ☾
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  },

  // === AUTH UI ===
  authMode: 'signin',

  renderAuthState() {
    const area = document.getElementById('auth-area');
    if (!area) return;

    if (typeof Cloud !== 'undefined' && Cloud.isSignedIn()) {
      const email = this.esc(Cloud.getUserEmail() || '');
      const tier = Cloud.getTier();
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
      const syncHtml = Cloud.canAccess('cloud_sync')
        ? `<span id="sync-indicator" class="sync-indicator sync-synced" title="Cloud sync active"></span>`
        : '';
      area.innerHTML = `
        <div class="auth-user">
          <span class="auth-name">${email}</span>
          <span class="tier-badge tier-${tier}">${tierLabel}</span>
          ${syncHtml}
          <a class="tier-link" onclick="UI.showTierOverview()">Plans</a>
          ${Cloud.isAdmin() ? '<a class="tier-link" href="admin.html" target="_blank">Admin</a>' : ''}
          <button class="btn btn-sm" onclick="Cloud.signOut()">Sign Out</button>
        </div>
      `;
    } else {
      area.innerHTML = `
        <a class="tier-link" onclick="UI.showTierOverview()">Plans</a>
        <button class="btn btn-sm" onclick="UI.openAuthModal()">
          &#9729; Sign in
        </button>
      `;
    }
  },

  // === NOTIFICATION BANNERS ===
  renderNotifications(notifications) {
    const container = document.getElementById('notification-banners');
    if (!container) return;
    if (!notifications || notifications.length === 0) {
      container.innerHTML = '';
      return;
    }
    const html = notifications
      .filter(n => !sessionStorage.getItem('dismissed_notif_' + n.id))
      .map(n => `
        <div class="notification-banner" data-notif-id="${this.escAttr(n.id)}">
          <div class="notification-banner-message">${this.esc(n.message)}</div>
          <button class="notification-banner-dismiss"
            onclick="UI.dismissNotification('${this.escAttr(n.id)}')"
            aria-label="Dismiss">&times;</button>
        </div>
      `).join('');
    container.innerHTML = html;
  },

  dismissNotification(id) {
    sessionStorage.setItem('dismissed_notif_' + id, '1');
    const banner = document.querySelector(`.notification-banner[data-notif-id="${CSS.escape(id)}"]`);
    if (banner) banner.remove();
  },

  openAuthModal() {
    this.authMode = 'signin';
    document.getElementById('auth-modal-title').textContent = 'Sign In';
    document.getElementById('auth-submit-btn').textContent = 'Sign In';
    document.getElementById('auth-toggle-btn').textContent = 'Need an account?';
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-error').textContent = '';
    document.getElementById('auth-modal').classList.add('active');
  },

  toggleAuthMode() {
    if (this.authMode === 'signin') {
      this.authMode = 'signup';
      document.getElementById('auth-modal-title').textContent = 'Create Account';
      document.getElementById('auth-submit-btn').textContent = 'Create Account';
      document.getElementById('auth-toggle-btn').textContent = 'Already have an account?';
    } else {
      this.authMode = 'signin';
      document.getElementById('auth-modal-title').textContent = 'Sign In';
      document.getElementById('auth-submit-btn').textContent = 'Sign In';
      document.getElementById('auth-toggle-btn').textContent = 'Need an account?';
    }
    document.getElementById('auth-error').textContent = '';
  },

  async submitAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');

    if (!email || !password) {
      errorEl.textContent = 'Please enter both email and password.';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters.';
      return;
    }

    errorEl.textContent = '';
    const btn = document.getElementById('auth-submit-btn');
    btn.disabled = true;
    btn.textContent = this.authMode === 'signin' ? 'Signing in...' : 'Creating account...';

    let success;
    if (this.authMode === 'signin') {
      success = await Cloud.signIn(email, password);
    } else {
      success = await Cloud.signUp(email, password);
    }

    btn.disabled = false;
    btn.textContent = this.authMode === 'signin' ? 'Sign In' : 'Create Account';

    if (success) {
      this.closeModal('auth-modal');
    }
  },

  renderSyncIndicator(state) {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    el.className = 'sync-indicator sync-' + state;
    el.title = state === 'syncing' ? 'Syncing...'
             : state === 'synced' ? 'All changes saved to cloud'
             : 'Sync error — changes saved locally';
  },

  // === VIEWS ===
  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    // Update header
    const backBtn = document.getElementById('btn-back');
    if (viewId === 'roster-list' || viewId === 'tier-overview') {
      backBtn.classList.add('hidden');
    } else {
      backBtn.classList.remove('hidden');
    }
  },

  // === ROSTER LIST ===
  renderRosterList() {
    const rosters = Storage.getAllRosters();
    const grid = document.getElementById('roster-grid');
    const maxRosters = (typeof Cloud !== 'undefined') ? Cloud.getMaxRosters() : 3;
    const atLimit = rosters.length >= maxRosters;

    // Update header buttons visibility
    const headerCreate = document.querySelector('.header-actions .btn-primary');
    if (headerCreate) {
      headerCreate.disabled = atLimit;
      if (atLimit) headerCreate.title = `Roster limit reached (${rosters.length}/${maxRosters === Infinity ? '\u221e' : maxRosters})`;
      else headerCreate.title = '';
    }
    const headerImport = document.querySelector('.header-actions .btn:not(.btn-primary)');
    if (headerImport) {
      const canImport = (typeof Cloud !== 'undefined') ? Cloud.canAccess('import_export') : false;
      headerImport.disabled = !canImport;
      if (!canImport) headerImport.title = 'Import requires Standard tier or above';
      else headerImport.title = '';
    }

    if (rosters.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3>No Warbands Yet</h3>
          <p>Create your first warband to begin your campaign in the City of the Damned.</p>
          <button class="btn btn-primary" onclick="UI.openCreateModal()">Create Warband</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = rosters.map(r => {
      const warbandResult = DataService.getWarband(r.warbandId);
      const warbandName = warbandResult
        ? (warbandResult.subfaction || warbandResult.warbandFile.name)
        : r.warbandId;
      const memberCount = RosterModel.getMemberCount(r);
      const rating = RosterModel.calculateWarbandRating(r);
      return `
        <div class="roster-card" onclick="UI.openRoster('${r.id}')">
          <div class="roster-card-name">${this.esc(r.name)}</div>
          <div class="roster-card-warband">${this.esc(warbandName)}</div>
          <div class="roster-card-stats">
            <div class="roster-card-stat">Members: <strong>${memberCount}</strong></div>
            <div class="roster-card-stat">Rating: <strong>${rating}</strong></div>
            <div class="roster-card-stat">Gold: <strong>${r.gold}</strong></div>
            <div class="roster-card-stat">Battles: <strong>${r.battleLog.length}</strong></div>
          </div>
          <div class="roster-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-sm" onclick="UI.exportRoster('${r.id}')" ${(typeof Cloud !== 'undefined' && !Cloud.canAccess('import_export')) ? 'disabled title="Requires Standard tier"' : ''}>Export</button>
            <button class="btn btn-sm btn-danger" onclick="UI.confirmDeleteRoster('${r.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  },

  // === CREATE ROSTER MODAL ===
  openCreateModal() {
    if (typeof Cloud !== 'undefined') {
      const rosters = Storage.getAllRosters();
      const max = Cloud.getMaxRosters();
      if (rosters.length >= max) {
        this.toast(`Roster limit reached (${rosters.length}/${max === Infinity ? '\u221e' : max}). Upgrade your tier for more.`, 'error');
        return;
      }
    }
    const modal = document.getElementById('create-modal');
    const select = document.getElementById('create-warband-select');
    select.innerHTML = '<option value="">-- Select Warband --</option>' +
      DataService.getAllWarbands()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(w => `<option value="${w.id}">${this.esc(w.name)} (${this.esc(w.source)})</option>`)
        .join('');
    document.getElementById('create-roster-name').value = '';
    document.getElementById('warband-description').textContent = '';
    modal.classList.add('active');
  },

  closeCreateModal() {
    document.getElementById('create-modal').classList.remove('active');
  },

  onWarbandSelectChange() {
    const id = document.getElementById('create-warband-select').value;
    const desc = document.getElementById('warband-description');
    const result = DataService.getWarband(id);
    if (result) {
      const { warbandFile } = result;
      const lore = DataService._stripHtml(warbandFile.lore || warbandFile.warbandRules?.choiceFluff || '')
        .replace(/\s+/g, ' ').trim().slice(0, 300);
      desc.textContent = `${lore} Starting gold: ${warbandFile.warbandRules?.startingGc ?? 500} gc.`;
    } else {
      desc.textContent = '';
    }
  },

  submitCreateRoster() {
    const name = document.getElementById('create-roster-name').value.trim();
    const warbandId = document.getElementById('create-warband-select').value;
    if (!name) return this.toast('Enter a warband name.', 'error');
    if (!warbandId) return this.toast('Select a warband type.', 'error');

    const roster = RosterModel.createRoster(name, warbandId);
    Storage.saveRoster(roster);
    this.closeCreateModal();
    this.renderRosterList();
    this.toast(`"${name}" warband created!`, 'success');
  },

  // === ROSTER EDITOR ===
  openRoster(id) {
    const roster = Storage.getRoster(id);
    if (!roster) return this.toast('Roster not found.', 'error');
    this.currentRoster = roster;
    if (!roster.hiredSwords) roster.hiredSwords = [];
    if (!roster.customWarriors) roster.customWarriors = [];
    this.showView('roster-editor');
    this.renderRosterEditor();
  },

  saveCurrentRoster() {
    if (!this.currentRoster) return;
    this.currentRoster.updatedAt = new Date().toISOString();
    Storage.saveRoster(this.currentRoster);
  },

  renderRosterEditor() {
    const r = this.currentRoster;
    if (!r) return;
    const warbandResult = DataService.getWarband(r.warbandId);
    const warbandDisplayName = warbandResult
      ? (warbandResult.subfaction || warbandResult.warbandFile.name)
      : r.warbandId;
    const memberCount = RosterModel.getMemberCount(r);
    const rating = RosterModel.calculateWarbandRating(r);
    const totalSpent = RosterModel.calculateTotalCost(r);

    // Header
    document.getElementById('editor-roster-name').value = r.name;
    document.getElementById('editor-warband-type').textContent = warbandDisplayName;

    // Summary
    document.getElementById('summary-members').textContent = `${memberCount} / ${this.getMaxMembers(r)}`;
    document.getElementById('summary-rating').textContent = rating;
    document.getElementById('summary-gold').textContent = r.gold + ' gc';
    document.getElementById('summary-spent').textContent = totalSpent + ' gc';
    document.getElementById('summary-battles').textContent = r.battleLog.length;

    // Tab contents
    this.renderWarriorsTab();
    this.renderProgressTab();
  },

  // === WARRIORS TAB ===
  renderWarriorsTab() {
    const r = this.currentRoster;
    const warbandResult = DataService.getWarband(r.warbandId);
    const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
    const warbandName = subfaction || warbandFile?.name || '';
    const heroes   = (warbandFile?.fighters || []).filter(f => f.type === 'hero');
    const henchmen = (warbandFile?.fighters || []).filter(f => f.type === 'henchman');

    // Capture collapsed state of warrior cards before re-render
    const collapsedCards = new Set();
    document.querySelectorAll('.warrior-card-body.collapsed').forEach(el => {
      const id = el.id.replace('warrior-body-', '');
      if (id) collapsedCards.add(id);
    });

    // Heroes section
    const heroesContent = document.getElementById('heroes-content');
    if (r.heroes.length === 0) {
      heroesContent.innerHTML = '<p class="text-dim" style="padding: 0.5rem 0;">No heroes recruited yet.</p>';
    } else {
      heroesContent.innerHTML = r.heroes.map((h, idx) => this.renderWarriorCard(h, idx, true)).join('');
    }

    // Hero add dropdown
    const heroAddContainer = document.getElementById('hero-add-buttons');
    const maxHeroes = heroes.reduce((sum, h) => sum + (h.maxQty || 0), 0);
    const atTotalCap = r.heroes.length >= maxHeroes;
    heroAddContainer.innerHTML = `
      <select id="hero-add-select" class="form-control" style="font-size:0.8rem; padding:0.2rem 2rem 0.2rem 0.4rem;" onclick="event.stopPropagation()" onchange="UI.addWarriorFromSelect('heroes')">
        <option value="">+ Add Hero</option>
        ${heroes.map(ht => {
          const count = r.heroes.filter(h => h.type === ht.id).length;
          const atMax = atTotalCap || count >= (ht.maxQty || 1);
          return `<option value="${ht.id}" ${atMax ? 'disabled' : ''}>${this.esc(ht.name)} (${ht.costGc ?? 0} gc)${atMax ? ' \u2713' : ''}</option>`;
        }).join('')}
      </select>
    `;

    // Henchmen section
    const henchmenContent = document.getElementById('henchmen-content');
    if (r.henchmen.length === 0) {
      henchmenContent.innerHTML = '<p class="text-dim" style="padding: 0.5rem 0;">No henchmen recruited yet.</p>';
    } else {
      henchmenContent.innerHTML = r.henchmen.map((h, idx) => this.renderWarriorCard(h, idx, false)).join('');
    }

    // Henchmen add dropdown
    const henchAddContainer = document.getElementById('henchmen-add-buttons');
    henchAddContainer.innerHTML = `
      <select id="henchmen-add-select" class="form-control" style="font-size:0.8rem; padding:0.2rem 2rem 0.2rem 0.4rem;" onclick="event.stopPropagation()" onchange="UI.addWarriorFromSelect('henchmen')">
        <option value="">+ Add Henchman</option>
        ${henchmen.map(ht => {
          return `<option value="${ht.id}">${this.esc(ht.name)} (${ht.costGc ?? 0} gc)</option>`;
        }).join('')}
      </select>
    `;

    // Hired Swords section
    const hiredSwordsContent = document.getElementById('hired-swords-content');
    if (r.hiredSwords.length === 0) {
      hiredSwordsContent.innerHTML = '<p class="text-dim" style="padding: 0.5rem 0;">No hired swords recruited yet.</p>';
    } else {
      hiredSwordsContent.innerHTML = r.hiredSwords.map((hs, idx) => this.renderWarriorCard(hs, idx, true, 'hiredSwords')).join('');
    }

    // Hired Swords add dropdown
    const hiredSwordsAddContainer = document.getElementById('hired-swords-add-buttons');
    const availableHiredSwords = DataService.getAvailableHiredSwords(warbandName);
    hiredSwordsAddContainer.innerHTML = `
      <select id="hired-swords-add-select" class="form-control" style="font-size:0.8rem; padding:0.2rem 2rem 0.2rem 0.4rem;" onclick="event.stopPropagation()" onchange="UI.addWarriorFromSelect('hiredSwords')">
        <option value="">+ Hire Sword</option>
        ${availableHiredSwords.map(hs => `<option value="${hs.key}">${this.esc(hs.name)} (${parseInt(hs.cost) || 0} gc)</option>`).join('')}
      </select>
    `;

    // Custom section
    const customContent = document.getElementById('custom-content');
    const canCustom = (typeof Cloud !== 'undefined') ? Cloud.canAccess('custom_warriors') : false;
    const customAddBtns = document.getElementById('custom-add-buttons');
    if (!canCustom) {
      customContent.innerHTML = '<div class="locked-message"><span class="lock-icon">&#128274;</span> Custom warriors require <strong>Pro</strong> tier. <a class="tier-link" onclick="UI.showTierOverview()">View Plans</a></div>';
      if (customAddBtns) customAddBtns.innerHTML = '';
    } else if ((r.customWarriors || []).length === 0) {
      customContent.innerHTML = '<p class="text-dim" style="padding: 0.5rem 0;">No custom warriors created yet.</p>';
    } else {
      customContent.innerHTML = r.customWarriors.map((cw, idx) => this.renderWarriorCard(cw, idx, true, 'customWarriors')).join('');
    }

    // Restore collapsed state of warrior cards after re-render
    collapsedCards.forEach(id => {
      const body = document.getElementById('warrior-body-' + id);
      if (body) body.classList.add('collapsed');
    });
  },

  renderWarriorCard(warrior, index, isHero, listTypeOverride) {
    const eqCost = warrior.equipment.reduce((sum, eq) => {
      const item = DataService.getEquipmentItem(eq.id);
      return sum + (item ? (item.cost?.cost ?? 0) : 0);
    }, 0);
    const totalCost = warrior.cost + eqCost;

    // Experience bar for heroes
    let expBar = '';
    if (isHero) {
      const level = RosterModel.getHeroLevel(warrior.experience);
      const nextThreshold = RosterModel.getNextThreshold(warrior.experience);
      const prevThreshold = level > 0 ? DataService.advancement.heroAdvancement.expThresholds[level - 1] : 0;
      const progress = nextThreshold > prevThreshold ? ((warrior.experience - prevThreshold) / (nextThreshold - prevThreshold)) * 100 : 100;
      expBar = `
        <div class="exp-bar-container">
          <div class="exp-bar-label">
            <span>EXP: ${warrior.experience} (Level ${level})</span>
            <span>Next: ${nextThreshold}</span>
          </div>
          <div class="exp-bar"><div class="exp-bar-fill" style="width:${Math.min(progress, 100)}%"></div></div>
        </div>
      `;
    } else {
      expBar = `
        <div class="exp-bar-container">
          <div class="exp-bar-label"><span>EXP: ${warrior.experience}</span><span>Group Size: ${warrior.groupSize || 1}</span></div>
        </div>
      `;
    }

    const listType = listTypeOverride || (isHero ? 'heroes' : 'henchmen');
    const cardTypeClass = listTypeOverride === 'hiredSwords' ? 'warrior-card--hired'
      : listTypeOverride === 'customWarriors' ? 'warrior-card--custom'
      : isHero ? 'warrior-card--hero' : 'warrior-card--henchman';
    const showTypeName = warrior.name !== warrior.typeName;

    return `
      <div class="warrior-card ${cardTypeClass}" id="warrior-${warrior.id}">
        <div class="warrior-card-header" onclick="UI.toggleWarriorCard('${warrior.id}')">
          <div>
            <span class="warrior-name" onclick="event.stopPropagation(); UI.inlineEditName(this, '${listType}', ${index})">${this.esc(warrior.name)}</span>
            ${showTypeName ? `<span class="warrior-type">${warrior.typeName}</span>` : ''}
          </div>
          <span class="warrior-cost">${totalCost} gc</span>
        </div>
        <div class="warrior-card-body" id="warrior-body-${warrior.id}">
          <div class="form-group">
            ${(typeof Cloud !== 'undefined' && Cloud.canAccess('warrior_names'))
              ? `<input type="text" class="inline-edit" value="${this.esc(warrior.name)}"
                  onchange="UI.renameWarrior('${listType}', ${index}, this.value)" style="font-weight:600; font-size: 0.95rem; width: 100%;">`
              : `<span style="font-weight:600; font-size: 0.95rem;">${this.esc(warrior.name)}</span>`}
          </div>

          <div class="stat-line">
            ${['m','ws','bs','s','t','w','i','a','ld'].map(stat => {
              const isModified = warrior.stats[stat] !== warrior.baseStats[stat];
              return `
                <div class="stat-cell">
                  <div class="stat-label">${stat}</div>
                  <div class="stat-value${isModified ? ' modified' : ''}">${warrior.stats[stat]}</div>
                </div>
              `;
            }).join('')}
          </div>

          ${expBar}

          ${warrior.specialRules.length > 0 ? `
          <div class="tag-section mt-1">
            <div class="tag-section-label">Special Rules</div>
            <div class="tag-list">${warrior.specialRules.map(sr => { const desc = DataService.getSpecialRuleDescription(sr); return '<span class="tag"' + (desc ? ' data-tooltip="' + this.escAttr(desc) + '"' : '') + '>' + this.esc(sr) + '</span>'; }).join('')}</div>
          </div>` : ''}

          <div class="tag-section mt-1">
            <div class="tag-section-label">Equipment</div>
            <div class="tag-list">
              ${warrior.equipment.map((eq, eqIdx) => {
                const itemData = DataService.getEquipmentItem(eq.id);
                const tooltip = itemData ? this.escAttr(itemData.rules) : '';
                return `<span class="tag equipment" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>${eq.name} <span class="tag-remove" onclick="UI.removeEquipment('${listType}', ${index}, ${eqIdx})">x</span></span>`;
              }).join('')}
              <button class="btn btn-sm" onclick="UI.openEquipmentModal('${listType}', ${index})">+ Add</button>
            </div>
          </div>

          <div class="tag-section mt-1">
            <div class="tag-section-label">Skills</div>
            <div class="tag-list">
              ${warrior.skills.map((sk, skIdx) => {
                const skillData = DataService.getSkill(sk.id);
                const tooltip = skillData ? this.esc(skillData.description) : '';
                return `<span class="tag skill" ${tooltip ? `data-tooltip="${tooltip}"` : ''}>${sk.name} <span class="tag-remove" onclick="UI.removeSkill('${listType}', ${index}, ${skIdx})">x</span></span>`;
              }).join('')}
              ${isHero ? `<button class="btn btn-sm" onclick="UI.openSkillModal('${listType}', ${index})">+ Add</button>` : ''}
            </div>
          </div>

          ${this.renderSpellSection(warrior, listType, index)}

          ${listType !== 'henchmen' && listType !== 'hiredSwords' ? `
          <div class="tag-section mt-1">
            <div class="tag-section-label">Injuries</div>
            <div class="tag-list">
              ${warrior.injuries.map((inj, injIdx) => `
                <span class="tag injury">${inj.name} <span class="tag-remove" onclick="UI.removeInjury('${listType}', ${index}, ${injIdx})">x</span></span>
              `).join('')}
              <button class="btn btn-sm" onclick="UI.openInjuryModal('${listType}', ${index})">+ Add</button>
            </div>
          </div>
          ` : ''}

          <div class="tag-section mt-1">
            <div class="tag-section-label">Notes</div>
            <textarea class="warrior-notes" placeholder="Add notes..." oninput="UI.updateWarriorNotes('${listType}', ${index}, this.value)">${this.esc(warrior.notes || '')}</textarea>
          </div>

          <div class="warrior-actions">
            <button class="btn btn-sm" onclick="UI.adjustExp('${listType}', ${index}, 1)">+1 XP</button>
            <button class="btn btn-sm" onclick="UI.adjustExp('${listType}', ${index}, -1)">-1 XP</button>
            <button class="btn btn-sm" onclick="UI.openStatAdjust('${listType}', ${index})">Adjust Stats</button>
            ${!isHero ? `
              <button class="btn btn-sm" onclick="UI.adjustGroupSize(${index}, 1)">+1 Member</button>
              <button class="btn btn-sm" onclick="UI.adjustGroupSize(${index}, -1)">-1 Member</button>
              <button class="btn btn-sm" onclick="UI.openLadsGotTalentModal(${index})">Lad's Got Talent</button>
            ` : ''}
            <button class="btn btn-sm btn-danger" onclick="UI.removeWarrior('${listType}', ${index})">Remove</button>
          </div>
        </div>
      </div>
    `;
  },

  hasSpellAccess(warrior) {
    // spellAccess is computed at warrior creation and stored on the warrior object
    if (Array.isArray(warrior.spellAccess) && warrior.spellAccess.length > 0) return true;
    // Fallback: specialRules keyword check (covers old data, custom warriors, hired swords)
    const wizardRules = ['Wizard', 'Warrior Wizard', 'Prayers of Sigmar', 'Magic User', 'Prayers', 'Spellcaster', 'Prayercaster'];
    return (warrior.specialRules || []).some(r => wizardRules.includes(r));
  },

  renderSpellSection(warrior, listType, index) {
    if (!this.hasSpellAccess(warrior)) return '';
    const spells = warrior.spells || [];
    const spellTags = spells.map((sp, spIdx) => {
      const spellData = DataService.getSpell(sp.id);
      const diff = spellData ? (spellData.difficulty === 'Auto' ? 'Auto' : 'Diff: ' + spellData.difficulty) : '';
      const desc = spellData ? this.esc(spellData.description) : '';
      const tooltip = diff && desc ? diff + '. ' + desc : desc;
      return '<span class="tag spell-tag"' + (tooltip ? ' data-tooltip="' + tooltip + '"' : '') + '>' + sp.name + ' <span class="tag-remove" onclick="UI.removeSpell(\'' + listType + '\', ' + index + ', ' + spIdx + ')">x</span></span>';
    }).join('');
    return '<div class="tag-section mt-1">' +
      '<div class="tag-section-label">Spells</div>' +
      '<div class="tag-list">' + spellTags +
      '<button class="btn btn-sm" onclick="UI.openSpellModal(\'' + listType + '\', ' + index + ')">+ Add</button>' +
      '</div></div>';
  },

  toggleWarriorCard(id) {
    const body = document.getElementById('warrior-body-' + id);
    if (body) body.classList.toggle('collapsed');
  },

  // === ADD WARRIOR ===
  addWarrior(type, isHero) {
    const r = this.currentRoster;
    const warbandResult = DataService.getWarband(r.warbandId);
    if (!warbandResult) return;
    const { warbandFile, subfaction } = warbandResult;
    const fighters = warbandFile.fighters || [];

    if (isHero) {
      const fighter = fighters.find(f => f.id === type && f.type === 'hero');
      const currentCount = r.heroes.filter(h => h.type === type).length;
      if (currentCount >= (fighter?.maxQty ?? 1)) {
        return this.toast(`Maximum ${fighter?.name ?? type}s reached (${fighter?.maxQty ?? 1}).`, 'error');
      }
      // Total hero cap
      const maxHeroes = fighters.filter(f => f.type === 'hero').reduce((sum, h) => sum + (h.maxQty || 0), 0);
      if (r.heroes.length >= maxHeroes) {
        return this.toast(`Already at max heroes (${maxHeroes}).`, 'error');
      }
    }

    const memberCount = RosterModel.getMemberCount(r);
    const maxMembers = this.getMaxMembers(r);
    if (memberCount >= maxMembers) {
      return this.toast(`Warband is full (${maxMembers} members).`, 'error');
    }

    const fighter = fighters.find(f => f.id === type);
    const warrior = RosterModel.createWarrior(fighter, warbandFile, subfaction);
    if (!warrior) return this.toast('Unknown warrior type.', 'error');

    if (isHero) {
      r.heroes.push(warrior);
    } else {
      r.henchmen.push(warrior);
    }

    this.saveCurrentRoster();
    this.renderRosterEditor();
    this.toast(`${warrior.typeName} added.`, 'success');
  },

  addHiredSword(key) {
    const r = this.currentRoster;
    const warrior = RosterModel.createHiredSword(key);
    if (!warrior) return this.toast('Unknown hired sword.', 'error');

    const memberCount = RosterModel.getMemberCount(r);
    const maxMembers = this.getMaxMembers(r);
    if (memberCount >= maxMembers) {
      return this.toast(`Warband is full (${maxMembers} members).`, 'error');
    }

    r.hiredSwords.push(warrior);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    this.toast(`${warrior.name} hired!`, 'success');
  },

  addWarriorFromSelect(section) {
    const selectIds = { heroes: 'hero-add-select', hiredSwords: 'hired-swords-add-select', henchmen: 'henchmen-add-select' };
    const select = document.getElementById(selectIds[section]);
    if (!select || !select.value) return this.toast('Select a warrior type first.', 'error');
    const type = select.value;

    if (section === 'hiredSwords') {
      this.addHiredSword(type);
    } else {
      this.addWarrior(type, section === 'heroes');
    }
    select.value = '';
  },

  openCustomWarriorModal() {
    if (typeof Cloud !== 'undefined' && !Cloud.canAccess('custom_warriors')) {
      return this.toast('Custom warriors require Pro tier.', 'error');
    }
    document.getElementById('custom-name').value = '';
    document.getElementById('custom-cost').value = '0';
    document.getElementById('custom-stat-m').value = '4';
    document.getElementById('custom-stat-ws').value = '3';
    document.getElementById('custom-stat-bs').value = '3';
    document.getElementById('custom-stat-s').value = '3';
    document.getElementById('custom-stat-t').value = '3';
    document.getElementById('custom-stat-w').value = '1';
    document.getElementById('custom-stat-i').value = '3';
    document.getElementById('custom-stat-a').value = '1';
    document.getElementById('custom-stat-ld').value = '7';
    document.getElementById('custom-rules').value = '';
    document.getElementById('custom-warrior-modal').classList.add('active');
  },

  submitCustomWarrior() {
    const name = document.getElementById('custom-name').value.trim();
    if (!name) return this.toast('Enter a warrior name.', 'error');
    const cost = parseInt(document.getElementById('custom-cost').value) || 0;
    const stats = {};
    for (const stat of ['m','ws','bs','s','t','w','i','a','ld']) {
      stats[stat] = parseInt(document.getElementById('custom-stat-' + stat).value) || 0;
    }
    const rulesStr = document.getElementById('custom-rules').value.trim();
    const specialRules = rulesStr ? rulesStr.split(',').map(s => s.trim()).filter(s => s) : [];

    const warrior = RosterModel.createCustomWarrior(name, cost, stats, specialRules);
    const r = this.currentRoster;
    r.customWarriors.push(warrior);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    document.getElementById('custom-warrior-modal').classList.remove('active');
    this.toast(`${name} created!`, 'success');
  },

  // === LAD'S GOT TALENT ===
  openLadsGotTalentModal(henchmanIndex) {
    const r = this.currentRoster;
    const warbandResult = DataService.getWarband(r.warbandId);
    const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
    const heroFighters = (warbandFile?.fighters || []).filter(f => f.type === 'hero');

    // Max heroes check
    const maxHeroes = heroFighters.reduce((sum, h) => sum + (h.maxQty || 0), 0);
    if (r.heroes.length >= maxHeroes) {
      return this.toast('Already at max heroes (' + maxHeroes + '). Roll again on the advancement table.', 'error');
    }

    // Collect all skill subtypes available to heroes in this warband (deduplicated)
    const allSkillSubtypes = [...new Set(
      heroFighters.flatMap(h => DataService.resolveSkillAccess(h, subfaction))
    )];

    const modal = document.getElementById('lads-got-talent-modal');
    modal.dataset.henchmanIndex = henchmanIndex;

    const henchman = r.henchmen[henchmanIndex];
    document.getElementById('lgt-henchman-name').textContent = henchman.typeName;

    // Render skill list checkboxes
    const listContainer = document.getElementById('lgt-skill-lists');
    listContainer.innerHTML = allSkillSubtypes.map(subtype => {
      return '<label style="display:block; margin-bottom:0.4rem;">' +
        '<input type="checkbox" class="lgt-skill-checkbox" value="' + this.escAttr(subtype) + '"> ' +
        this.esc(subtype) +
      '</label>';
    }).join('');

    modal.classList.add('active');
  },

  submitLadsGotTalent() {
    const modal = document.getElementById('lads-got-talent-modal');
    const henchmanIndex = parseInt(modal.dataset.henchmanIndex);
    const r = this.currentRoster;
    const henchman = r.henchmen[henchmanIndex];
    if (!henchman) return;

    // Validate exactly 2 skill lists chosen
    const checked = [...document.querySelectorAll('.lgt-skill-checkbox:checked')];
    if (checked.length !== 2) {
      return this.toast('Choose exactly 2 skill lists.', 'error');
    }
    const skillAccess = checked.map(cb => cb.value);

    // Create promoted hero
    const hero = RosterModel.promoteHenchmanToHero(henchman, skillAccess);
    r.heroes.push(hero);

    // Reduce henchman group size; remove group if now empty
    henchman.groupSize = (henchman.groupSize || 1) - 1;
    if (henchman.groupSize <= 0) {
      r.henchmen.splice(henchmanIndex, 1);
    }

    this.saveCurrentRoster();
    this.renderRosterEditor();
    modal.classList.remove('active');
    this.toast(hero.name + ' promoted to Hero! Make one roll on the Heroes Advance table.', 'success');
  },

  removeWarrior(listType, index) {
    const r = this.currentRoster;
    const warrior = r[listType][index];
    if (!warrior) return;
    r[listType].splice(index, 1);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    this.toast(`${warrior.name} removed.`, 'info');
  },

  inlineEditName(spanEl, listType, index) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = warrior.name;
    input.className = 'inline-edit-header';
    input.style.cssText = 'font-weight:700; font-size:0.95rem; background:var(--bg-dark); color:var(--text-light); border:1px solid var(--primary); border-radius:4px; padding:0.1rem 0.3rem; width:100%;';
    spanEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      this.renameWarrior(listType, index, input.value);
      const newSpan = document.createElement('span');
      newSpan.className = 'warrior-name';
      newSpan.textContent = warrior.name;
      newSpan.onclick = (e) => { e.stopPropagation(); this.inlineEditName(newSpan, listType, index); };
      input.replaceWith(newSpan);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = warrior.name; input.blur(); }
    });
  },

  renameWarrior(listType, index, newName) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    warrior.name = newName.trim() || warrior.typeName;
    this.saveCurrentRoster();
    // Update header name display
    const card = document.getElementById('warrior-' + warrior.id);
    if (card) {
      const nameEl = card.querySelector('.warrior-name');
      if (nameEl) nameEl.textContent = warrior.name;
      // Also sync the inline-edit input inside the card body
      const bodyInput = card.querySelector('.warrior-card-body .inline-edit');
      if (bodyInput) bodyInput.value = warrior.name;
    }
  },

  // === EQUIPMENT MODAL ===
  openEquipmentModal(listType, index) {
    const r = this.currentRoster;
    const warrior = r[listType][index];
    const warbandResult = DataService.getWarband(r.warbandId);
    const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
    const warbandName = subfaction || warbandFile?.name || '';

    let warbandAllowedEquipment = null; // null = no Warband Equipment dropdown

    if (listType === 'hiredSwords') {
      // Hired swords: show all equipment (Uncle-Mel has no category restriction data)
      warbandAllowedEquipment = null;
    } else if (listType !== 'customWarriors') {
      // Heroes / henchmen: resolve from warband file on-the-fly
      const fighter = (warbandFile?.fighters || []).find(f => f.id === warrior.type);
      if (fighter) {
        warbandAllowedEquipment = DataService.resolveAllowedEquipment(fighter, warbandFile);
      }
    }

    const modal = document.getElementById('equipment-modal');
    const body = document.getElementById('equipment-modal-body');

    let html = '';

    // ── Warband Equipment dropdown (heroes/henchmen only) ──────────────────
    if (warbandAllowedEquipment !== null) {
      // Group by item type (Uncle Mel types: melee/missile/armour/misc/etc.)
      const warbandByType = {};
      for (const item of warbandAllowedEquipment) {
        const type = DataService.getEquipmentItem(item.id)?.type || 'misc';
        if (!warbandByType[type]) warbandByType[type] = [];
        warbandByType[type].push(item);
      }
      html += '<div style="margin-bottom:1rem;">';
      html += '<label style="display:block;font-size:0.8rem;text-transform:uppercase;font-weight:600;margin-bottom:0.3rem;">Warband Equipment</label>';
      html += `<select style="width:100%;padding:0.4rem;" onchange="UI.selectEquipmentFromSelect(this,'${listType}',${index})">`;
      html += '<option value="">— select item —</option>';
      for (const [type, items] of Object.entries(warbandByType)) {
        const catName = DataService.getEquipmentCategoryName(type);
        html += `<optgroup label="${this.escAttr(catName)}">`;
        for (const item of items) {
          const prefix = item.costPrefix ? `${item.costPrefix}` : '';
          html += `<option value="${this.escAttr(item.id)}">${this.esc(item.name)} (${prefix}${item.cost ?? 0} gc)</option>`;
        }
        html += '</optgroup>';
      }
      html += '</select></div>';
    }

    // ── All Equipment dropdown ─────────────────────────────────────────────
    // Build item list based on listType:
    //   customWarriors / hiredSwords → all equipment
    //   heroes/henchmen → filtered by permittedWarbands / excludedWarbands
    let allItems;
    if (listType === 'customWarriors' || listType === 'hiredSwords') {
      allItems = DataService.getAllEquipment();
    } else {
      allItems = DataService.getAllEquipment()
        .filter(item => DataService.canWarbandAccess(item, warbandName));
    }

    // Deduplicate and group by type
    const seenIds = new Set();
    const byType = {};
    for (const item of allItems) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      if (!byType[item.type]) byType[item.type] = [];
      byType[item.type].push(item);
    }

    html += '<div>';
    html += '<label style="display:block;font-size:0.8rem;text-transform:uppercase;font-weight:600;margin-bottom:0.3rem;">All Equipment</label>';
    html += `<select style="width:100%;padding:0.4rem;" onchange="UI.selectEquipmentFromSelect(this,'${listType}',${index})">`;
    html += '<option value="">— select item —</option>';
    for (const [type, items] of Object.entries(byType)) {
      if (items.length === 0) continue;
      const catName = DataService.getEquipmentCategoryName(type);
      html += `<optgroup label="${this.escAttr(catName)}">`;
      for (const item of items) {
        html += `<option value="${this.escAttr(item.id)}">${this.esc(item.name)} (${item.cost?.cost ?? 0} gc)</option>`;
      }
      html += '</optgroup>';
    }
    html += '</select></div>';

    body.innerHTML = html;
    modal.classList.add('active');
  },

  selectEquipmentFromSelect(select, listType, index) {
    const itemId = select.value;
    if (!itemId) return;
    this.selectEquipment(listType, index, itemId);
  },

  selectEquipment(listType, index, itemId) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    RosterModel.addEquipment(warrior, itemId);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    document.getElementById('equipment-modal').classList.remove('active');
    const item = DataService.getEquipmentItem(itemId);
    this.toast(`${item.name} added to ${warrior.name}.`, 'success');
  },

  removeEquipment(listType, index, eqIndex) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    RosterModel.removeEquipment(warrior, eqIndex);
    this.saveCurrentRoster();
    this.renderRosterEditor();
  },

  // === SKILL MODAL ===
  openSkillModal(listType, index) {
    const warrior = this.currentRoster[listType][index];
    let accessCategories;
    if (warrior.isPromotedHenchman) {
      accessCategories = warrior.skillAccess || [];
    } else if (listType === 'customWarriors') {
      accessCategories = Object.keys(DataService.skills);
    } else if (listType === 'hiredSwords') {
      const template = DataService.getHiredSwordTemplate(warrior.type);
      accessCategories = template ? template.skillAccess : [];
    } else {
      const warband = DataService.getWarband(this.currentRoster.warbandId);
      const template = warband.heroes.find(h => h.type === warrior.type);
      accessCategories = template ? template.skillAccess : [];
    }

    const modal = document.getElementById('skill-modal');
    const body = document.getElementById('skill-modal-body');

    let html = '';
    for (const catId of accessCategories) {
      const skills = DataService.getSkillsByCategory(catId);
      if (skills.length === 0) continue;
      const catName = DataService.skills[catId]?.name || catId;
      html += `<h4 class="text-accent mb-1 mt-2" style="font-size:0.85rem; text-transform:uppercase;">${catName}</h4>`;
      for (const skill of skills) {
        const alreadyHas = warrior.skills.find(s => s.id === skill.id);
        const disabled = alreadyHas ? 'disabled' : '';
        html += `<button class="btn btn-sm mb-1" ${disabled} onclick="UI.selectSkill('${listType}', ${index}, '${skill.id}')" title="${this.esc(skill.description)}">${skill.name}</button> `;
      }
    }

    body.innerHTML = html;
    modal.classList.add('active');
  },

  selectSkill(listType, index, skillId) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    RosterModel.addSkill(warrior, skillId);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    document.getElementById('skill-modal').classList.remove('active');
    const skill = DataService.getSkill(skillId);
    this.toast(`${skill.name} learned by ${warrior.name}.`, 'success');
  },

  removeSkill(listType, index, skIndex) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    RosterModel.removeSkill(warrior, skIndex);
    this.saveCurrentRoster();
    this.renderRosterEditor();
  },

  // === SPELL MODAL ===
  openSpellModal(listType, index) {
    const warrior = this.currentRoster[listType][index];
    let spellLists;
    if (warrior.isPromotedHenchman) {
      spellLists = [];
    } else if (listType === 'customWarriors') {
      spellLists = Object.keys(DataService.spells);
    } else if (listType === 'hiredSwords') {
      const template = DataService.getHiredSwordTemplate(warrior.type);
      spellLists = template && template.spellAccess ? template.spellAccess : [];
    } else {
      const warband = DataService.getWarband(this.currentRoster.warbandId);
      const template = warband.heroes.find(h => h.type === warrior.type)
        || warband.henchmen.find(h => h.type === warrior.type);
      spellLists = template && template.spellAccess ? template.spellAccess : [];
    }

    const modal = document.getElementById('spell-modal');
    const body = document.getElementById('spell-modal-body');

    let html = '';
    for (const listId of spellLists) {
      const spells = DataService.getSpellsByList(listId);
      if (spells.length === 0) continue;
      const listName = DataService.spells[listId]?.name || listId;
      html += '<h4 class="text-accent mb-1 mt-2" style="font-size:0.85rem; text-transform:uppercase;">' + this.esc(listName) + '</h4>';
      html += '<div style="display:flex; flex-direction:column; gap:0.3rem;">';
      for (const spell of spells) {
        const alreadyHas = (warrior.spells || []).find(s => s.id === spell.id);
        const disabled = alreadyHas ? 'disabled' : '';
        const diff = spell.difficulty === 'Auto' ? 'Auto' : 'Difficulty: ' + spell.difficulty;
        html += '<button class="btn btn-sm" ' + disabled + ' data-tooltip="' + this.escAttr(spell.description) + '" onclick="UI.selectSpell(\'' + listType + '\', ' + index + ', \'' + spell.id + '\')">' + spell.name + ' (' + diff + ')</button>';
      }
      html += '</div>';
    }

    if (!html) {
      html = '<p class="text-dim">No spell lists available for this warrior.</p>';
    }

    body.innerHTML = html;
    modal.classList.add('active');
  },

  selectSpell(listType, index, spellId) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    if (!warrior.spells) warrior.spells = [];
    RosterModel.addSpell(warrior, spellId);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    document.getElementById('spell-modal').classList.remove('active');
    const spell = DataService.getSpell(spellId);
    this.toast(spell.name + ' learned by ' + warrior.name + '.', 'success');
  },

  removeSpell(listType, index, spIndex) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    RosterModel.removeSpell(warrior, spIndex);
    this.saveCurrentRoster();
    this.renderRosterEditor();
  },

  // === INJURY MODAL ===
  openInjuryModal(listType, index) {
    if (listType === 'henchmen' || listType === 'hiredSwords') return;
    const warrior = this.currentRoster[listType][index];
    const isHero = listType === 'heroes' || listType === 'hiredSwords' || listType === 'customWarriors';
    const injuryList = isHero ? DataService.injuries.heroInjuries : DataService.injuries.henchmenInjuries;

    const modal = document.getElementById('injury-modal');
    const body = document.getElementById('injury-modal-body');

    let html = '<div style="display:flex; flex-direction:column; gap:0.4rem;">';
    for (const inj of injuryList) {
      html += `<button class="btn btn-sm" onclick="UI.selectInjury('${listType}', ${index}, '${this.esc(inj.name)}')" title="${this.esc(inj.description)}">
        <strong>${inj.roll}</strong> - ${inj.name}
      </button>`;
    }
    html += '</div>';
    body.innerHTML = html;
    modal.classList.add('active');
  },

  selectInjury(listType, index, injuryName) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    RosterModel.addInjury(warrior, injuryName);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    document.getElementById('injury-modal').classList.remove('active');
    this.toast(`${injuryName} applied to ${warrior.name}.`, 'info');
  },

  removeInjury(listType, index, injIndex) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    RosterModel.removeInjury(warrior, injIndex);
    this.saveCurrentRoster();
    this.renderRosterEditor();
  },

  // === STAT ADJUST ===
  openStatAdjust(listType, index) {
    const warrior = this.currentRoster[listType][index];
    const modal = document.getElementById('stat-modal');
    const body = document.getElementById('stat-modal-body');

    const stats = ['m','ws','bs','s','t','w','i','a','ld'];
    let html = '<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.5rem;">';
    for (const stat of stats) {
      html += `
        <div style="text-align:center; background:var(--bg-input); border-radius:var(--radius); padding:0.5rem;">
          <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">${stat}</div>
          <div style="font-size:1.1rem; font-weight:700; color:var(--text-bright); margin:0.2rem 0;">${warrior.stats[stat]}</div>
          <div style="display:flex; gap:0.3rem; justify-content:center;">
            <button class="btn btn-sm" onclick="UI.modStat('${listType}', ${index}, '${stat}', -1)">-</button>
            <button class="btn btn-sm" onclick="UI.modStat('${listType}', ${index}, '${stat}', 1)">+</button>
          </div>
        </div>
      `;
    }
    html += '</div>';
    body.innerHTML = html;
    modal.classList.add('active');
  },

  modStat(listType, index, stat, delta) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    if (RosterModel.modifyStat(warrior, stat, delta)) {
      this.saveCurrentRoster();
      this.openStatAdjust(listType, index); // re-render
      this.renderRosterEditor();
    } else {
      this.toast('Stat limit reached.', 'error');
    }
  },

  // === NOTES ===
  updateWarriorNotes(listType, index, value) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    warrior.notes = value;
    this.saveCurrentRoster();
  },

  // === EXPERIENCE ===
  adjustExp(listType, index, amount) {
    const warrior = this.currentRoster[listType][index];
    if (!warrior) return;
    warrior.experience = Math.max(0, warrior.experience + amount);
    this.saveCurrentRoster();
    this.renderRosterEditor();
  },

  // === GROUP SIZE ===
  adjustGroupSize(index, delta) {
    const henchman = this.currentRoster.henchmen[index];
    if (!henchman) return;
    const newSize = (henchman.groupSize || 1) + delta;
    if (newSize < 1) return this.toast('Group must have at least 1 member.', 'error');
    const warband = DataService.getWarband(this.currentRoster.warbandId);
    const template = warband.henchmen.find(h => h.type === henchman.type);
    const maxSize = template?.maxGroupSize || 5;
    if (newSize > maxSize) return this.toast(`Maximum group size is ${maxSize}.`, 'error');
    henchman.groupSize = newSize;
    this.saveCurrentRoster();
    this.renderRosterEditor();
  },

  // === PROGRESS TAB ===
  renderProgressTab() {
    const r = this.currentRoster;
    const rating = RosterModel.calculateWarbandRating(r);
    const canBattleLog = (typeof Cloud !== 'undefined') ? Cloud.canAccess('battle_log') : false;
    const canViewBattleLog = (typeof Cloud !== 'undefined') ? (Cloud.TIER_RANK[Cloud.getTier()] >= Cloud.TIER_RANK['standard']) : false;
    const canNotes = (typeof Cloud !== 'undefined') ? Cloud.canAccess('campaign_notes') : false;

    // Rating
    document.getElementById('progress-rating').textContent = rating;

    // Gold management
    document.getElementById('gold-input').value = r.gold;
    document.getElementById('wyrdstone-input').value = r.wyrdstone;
    document.getElementById('member-limit-display').textContent = this.getMaxMembers(r);

    // Battle log
    const battleForm = document.querySelector('.battle-log-form');
    if (battleForm) {
      if (canBattleLog) {
        battleForm.style.display = '';
      } else {
        battleForm.style.display = 'none';
      }
    }
    const battleContainer = document.getElementById('battle-log-entries');
    if (!canViewBattleLog) {
      battleContainer.innerHTML = '<div class="locked-message"><span class="lock-icon">&#128274;</span> Battle log requires <strong>Standard</strong> tier or above. <a class="tier-link" onclick="UI.showTierOverview()">View Plans</a></div>';
    } else {
      this.renderBattleLog();
      // If Standard but not Pro, add a note
      if (canViewBattleLog && !canBattleLog && r.battleLog.length > 0) {
        battleContainer.insertAdjacentHTML('beforeend', '<p class="text-dim" style="font-size:0.8rem; margin-top:0.5rem;">Upgrade to <strong>Pro</strong> to add new battles.</p>');
      }
    }

    // Notes
    const notesArea = document.getElementById('roster-notes');
    if (!canNotes) {
      notesArea.disabled = true;
      notesArea.placeholder = 'Campaign notes require Standard tier or above.';
      notesArea.value = '';
    } else {
      notesArea.disabled = false;
      notesArea.placeholder = 'Write campaign notes, strategy, or lore here...';
      notesArea.value = r.notes || '';
    }
  },

  renderBattleLog() {
    const r = this.currentRoster;
    const container = document.getElementById('battle-log-entries');

    if (r.battleLog.length === 0) {
      container.innerHTML = '<p class="text-dim">No battles fought yet.</p>';
      return;
    }

    container.innerHTML = r.battleLog.slice().reverse().map(b => `
      <div class="battle-log-entry">
        <div class="battle-info">
          <div class="battle-number">Battle #${b.number}</div>
          <div class="battle-result">${this.esc(b.result)}</div>
          ${b.notes ? `<div class="battle-date">${this.esc(b.notes)}</div>` : ''}
        </div>
        <div class="battle-date">${new Date(b.date).toLocaleDateString()}</div>
      </div>
    `).join('');
  },

  updateGold() {
    const val = parseInt(document.getElementById('gold-input').value) || 0;
    this.currentRoster.gold = val;
    this.saveCurrentRoster();
    document.getElementById('summary-gold').textContent = val + ' gc';
  },

  updateWyrdstone() {
    const val = parseInt(document.getElementById('wyrdstone-input').value) || 0;
    this.currentRoster.wyrdstone = val;
    this.saveCurrentRoster();
  },

  getMaxMembers(roster) {
    if (roster.maxMembersOverride != null) return roster.maxMembersOverride;
    const result = DataService.getWarband(roster.warbandId);
    return result ? (result.warbandFile.warbandRules?.maxModels ?? 15) : 15;
  },

  adjustMemberLimit(amount) {
    const r = this.currentRoster;
    const warbandResult = DataService.getWarband(r.warbandId);
    const defaultMax = warbandResult ? (warbandResult.warbandFile.warbandRules?.maxModels ?? 15) : 15;
    const current = this.getMaxMembers(r);
    const newVal = current + amount;
    if (newVal < 1) return;
    r.maxMembersOverride = newVal;
    this.saveCurrentRoster();
    document.getElementById('member-limit-display').textContent = newVal;
    const memberCount = RosterModel.getMemberCount(r);
    document.getElementById('summary-members').textContent = `${memberCount} / ${newVal}`;
  },

  addBattle() {
    if (typeof Cloud !== 'undefined' && !Cloud.canAccess('battle_log')) {
      return this.toast('Adding battles requires Pro tier.', 'error');
    }
    const result = document.getElementById('battle-result-input').value.trim();
    if (!result) return this.toast('Enter a battle result.', 'error');
    const notes = document.getElementById('battle-notes-input').value.trim();
    RosterModel.addBattle(this.currentRoster, result, notes);
    this.saveCurrentRoster();
    document.getElementById('battle-result-input').value = '';
    document.getElementById('battle-notes-input').value = '';
    this.renderRosterEditor();
    this.toast('Battle recorded.', 'success');
  },

  updateNotes() {
    if (typeof Cloud !== 'undefined' && !Cloud.canAccess('campaign_notes')) return;
    this.currentRoster.notes = document.getElementById('roster-notes').value;
    this.saveCurrentRoster();
  },

  // === EXPORT PDF ===
  exportPDF() {
    if (typeof Cloud !== 'undefined' && !Cloud.canAccess('pdf_export')) {
      return this.toast('PDF export requires Pro tier.', 'error');
    }
    const r = this.currentRoster;
    if (!r) return this.toast('No roster open.', 'error');
    const warband = DataService.getWarband(r.warbandId);
    const memberCount = RosterModel.getMemberCount(r);
    const rating = RosterModel.calculateWarbandRating(r);
    const totalSpent = RosterModel.calculateTotalCost(r);

    const esc = (s) => {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    };

    const renderStatLine = (warrior) => {
      return ['m','ws','bs','s','t','w','i','a','ld'].map(stat => {
        const mod = warrior.stats[stat] !== warrior.baseStats[stat];
        return `<td class="${mod ? 'stat-mod' : ''}">${warrior.stats[stat]}</td>`;
      }).join('');
    };

    const renderWarrior = (warrior, listType) => {
      const eqCost = warrior.equipment.reduce((sum, eq) => {
        const item = DataService.getEquipmentItem(eq.id);
        return sum + (item ? (item.cost?.cost ?? 0) : 0);
      }, 0);

      let expInfo = '';
      if (listType !== 'henchmen') {
        const level = RosterModel.getHeroLevel(warrior.experience);
        expInfo = `Exp: ${warrior.experience} (Level ${level})`;
      } else {
        expInfo = `Exp: ${warrior.experience} | Group: ${warrior.groupSize || 1}`;
      }

      const equipment = warrior.equipment.map(eq => esc(eq.name)).join(', ') || '—';
      const skills = warrior.skills.map(sk => esc(sk.name)).join(', ') || '—';
      const spells = (warrior.spells || []).map(sp => esc(sp.name)).join(', ');
      const injuries = listType !== 'henchmen' && listType !== 'hiredSwords'
        ? warrior.injuries.map(inj => esc(inj.name)).join(', ')
        : '';
      const specials = warrior.specialRules.length > 0 ? warrior.specialRules.map(sr => esc(sr)).join(', ') : '';

      return `
        <div class="warrior-block">
          <div class="warrior-header">
            <span class="warrior-name">${esc(warrior.name)}</span>
            <span class="warrior-type">${esc(warrior.typeName)}</span>
            <span class="warrior-cost">${warrior.cost + eqCost} gc</span>
          </div>
          <table class="stat-table">
            <tr><th>M</th><th>WS</th><th>BS</th><th>S</th><th>T</th><th>W</th><th>I</th><th>A</th><th>Ld</th></tr>
            <tr>${renderStatLine(warrior)}</tr>
          </table>
          <div class="warrior-detail"><span class="detail-label">Experience:</span> ${expInfo}</div>
          ${specials ? `<div class="warrior-detail"><span class="detail-label">Special Rules:</span> ${specials}</div>` : ''}
          <div class="warrior-detail"><span class="detail-label">Equipment:</span> ${equipment}</div>
          <div class="warrior-detail"><span class="detail-label">Skills:</span> ${skills}</div>
          ${spells ? `<div class="warrior-detail"><span class="detail-label">Spells:</span> ${spells}</div>` : ''}
          ${injuries ? `<div class="warrior-detail"><span class="detail-label">Injuries:</span> ${injuries}</div>` : ''}
        </div>
      `;
    };

    const heroesHtml = r.heroes.length > 0
      ? r.heroes.map(h => renderWarrior(h, 'heroes')).join('')
      : '<p class="empty">No heroes recruited.</p>';

    const henchmenHtml = r.henchmen.length > 0
      ? r.henchmen.map(h => renderWarrior(h, 'henchmen')).join('')
      : '<p class="empty">No henchmen recruited.</p>';

    const hiredSwordsHtml = (r.hiredSwords || []).length > 0
      ? r.hiredSwords.map(hs => renderWarrior(hs, 'hiredSwords')).join('')
      : '';

    const customWarriorsHtml = (r.customWarriors || []).length > 0
      ? r.customWarriors.map(cw => renderWarrior(cw, 'customWarriors')).join('')
      : '';

    const battleLogHtml = r.battleLog.length > 0
      ? `<table class="battle-table">
          <tr><th>#</th><th>Result</th><th>Notes</th><th>Date</th></tr>
          ${r.battleLog.map(b => `
            <tr>
              <td>${b.number}</td>
              <td>${esc(b.result)}</td>
              <td>${esc(b.notes || '')}</td>
              <td>${new Date(b.date).toLocaleDateString()}</td>
            </tr>
          `).join('')}
        </table>`
      : '<p class="empty">No battles recorded.</p>';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${esc(r.name)} - Mordheim Roster</title>
<style>
  @page { margin: 12mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #2a231a; font-size: 10pt; line-height: 1.4; }

  .header { text-align: center; border-bottom: 2px solid #8b6914; padding-bottom: 8px; margin-bottom: 10px; }
  .header h1 { font-size: 18pt; color: #8b6914; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 2px; }
  .header .warband-type { font-size: 10pt; color: #6b6052; }

  .summary { display: flex; justify-content: center; gap: 24px; margin-bottom: 12px; padding: 6px 0; border-bottom: 1px solid #d4cabb; }
  .summary-item { text-align: center; }
  .summary-item .label { font-size: 7pt; color: #9b8e7e; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-item .value { font-size: 12pt; font-weight: 700; color: #2a231a; }
  .summary-item .value.gold { color: #8b6914; }

  .section-title { font-size: 11pt; color: #8b6914; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #d4cabb; padding-bottom: 3px; margin: 12px 0 6px 0; }

  .warrior-block { border: 1px solid #d4cabb; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px; page-break-inside: avoid; }
  .warrior-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .warrior-name { font-weight: 700; font-size: 10pt; }
  .warrior-type { font-size: 8pt; color: #6b6052; }
  .warrior-cost { margin-left: auto; font-weight: 600; color: #8b6914; font-size: 9pt; }

  .stat-table { border-collapse: collapse; margin-bottom: 4px; }
  .stat-table th, .stat-table td { border: 1px solid #d4cabb; text-align: center; padding: 2px 6px; font-size: 8pt; min-width: 24px; }
  .stat-table th { background: #f0ebe0; color: #6b6052; font-weight: 600; text-transform: uppercase; font-size: 7pt; }
  .stat-table td { font-weight: 700; }
  .stat-table td.stat-mod { color: #8b6914; }

  .warrior-detail { font-size: 8.5pt; color: #3d3529; margin-bottom: 1px; }
  .detail-label { font-weight: 600; color: #6b6052; }

  .battle-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .battle-table th, .battle-table td { border: 1px solid #d4cabb; padding: 3px 6px; text-align: left; }
  .battle-table th { background: #f0ebe0; color: #6b6052; font-weight: 600; font-size: 7.5pt; text-transform: uppercase; }

  .notes-section { margin-top: 12px; }
  .notes-box { border: 1px solid #d4cabb; border-radius: 4px; min-height: 80px; padding: 6px 8px; font-size: 8.5pt; color: #3d3529; white-space: pre-wrap; }
  .notes-lines { min-height: 60px; border: 1px solid #d4cabb; border-radius: 4px; background: repeating-linear-gradient(transparent, transparent 18px, #e8e0d0 18px, #e8e0d0 19px); }

  .empty { color: #9b8e7e; font-style: italic; font-size: 9pt; }
  .footer { text-align: center; margin-top: 16px; font-size: 7pt; color: #9b8e7e; border-top: 1px solid #d4cabb; padding-top: 6px; }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(r.name)}</h1>
    <div class="warband-type">${warband ? esc(warband.name) : esc(r.warbandId)}</div>
  </div>

  <div class="summary">
    <div class="summary-item"><div class="label">Members</div><div class="value">${memberCount} / ${this.getMaxMembers(r)}</div></div>
    <div class="summary-item"><div class="label">Rating</div><div class="value">${rating}</div></div>
    <div class="summary-item"><div class="label">Treasury</div><div class="value gold">${r.gold} gc</div></div>
    <div class="summary-item"><div class="label">Wyrdstone</div><div class="value">${r.wyrdstone}</div></div>
    <div class="summary-item"><div class="label">Spent</div><div class="value">${totalSpent} gc</div></div>
    <div class="summary-item"><div class="label">Battles</div><div class="value">${r.battleLog.length}</div></div>
  </div>

  <div class="section-title">Heroes</div>
  ${heroesHtml}

  <div class="section-title">Henchmen</div>
  ${henchmenHtml}

  ${hiredSwordsHtml ? `<div class="section-title">Hired Swords</div>
  ${hiredSwordsHtml}` : ''}

  ${customWarriorsHtml ? `<div class="section-title">Custom Warriors</div>
  ${customWarriorsHtml}` : ''}

  <div class="section-title">Battle Log</div>
  ${battleLogHtml}

  <div class="section-title">Campaign Notes</div>
  ${r.notes ? `<div class="notes-box">${esc(r.notes)}</div>` : ''}
  <div class="notes-lines" style="margin-top: 6px;">&nbsp;</div>

  <div class="footer">Mordheim Roster Manager &mdash; Printed ${new Date().toLocaleDateString()}</div>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (!printWin) return this.toast('Pop-up blocked — please allow pop-ups for this site.', 'error');
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = () => printWin.print();
  },

  // === EXPORT / IMPORT ===
  exportRoster(id) {
    if (typeof Cloud !== 'undefined' && !Cloud.canAccess('import_export')) {
      return this.toast('Export requires Standard tier or above.', 'error');
    }
    const json = Storage.exportRoster(id);
    if (!json) return this.toast('Roster not found.', 'error');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const roster = Storage.getRoster(id);
    a.download = `mordheim_${roster.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('Roster exported.', 'success');
  },

  importRoster() {
    if (typeof Cloud !== 'undefined' && !Cloud.canAccess('import_export')) {
      return this.toast('Import requires Standard tier or above.', 'error');
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          Storage.importRoster(ev.target.result);
          this.renderRosterList();
          this.toast('Roster imported!', 'success');
        } catch (err) {
          this.toast('Invalid roster file: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  // === DELETE ===
  confirmDeleteRoster(id) {
    const roster = Storage.getRoster(id);
    if (!roster) return;
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-message').textContent = `Delete "${roster.name}"? This cannot be undone.`;
    document.getElementById('confirm-yes').onclick = () => {
      Storage.deleteRoster(id);
      overlay.classList.remove('active');
      this.renderRosterList();
      this.toast(`"${roster.name}" deleted.`, 'info');
    };
    overlay.classList.add('active');
  },

  // === TIER OVERVIEW ===
  showTierOverview() {
    this.renderTierOverview();
    this.showView('tier-overview');
  },

  renderTierOverview() {
    const container = document.getElementById('tier-overview');
    if (!container) return;
    const currentTier = (typeof Cloud !== 'undefined' && Cloud.isSignedIn()) ? Cloud.getTier() : 'free';

    const features = [
      ['All 38 warbands',           true,    true,    true],
      ['Max rosters',               '3',     '10',    '\u221e'],
      ['Heroes & henchmen',         true,    true,    true],
      ['Equipment, skills, spells', true,    true,    true],
      ['Experience & stats',        true,    true,    true],
      ['Injuries',                  true,    true,    true],
      ['Hired swords',              true,    true,    true],
      ['Custom warrior names',       false,   true,    true],
      ['Campaign notes',            false,   true,    true],
      ['Cloud sync',                false,   true,    true],
      ['Import / export',           false,   true,    true],
      ['Battle log',                false,   'View',  'Full'],
      ['Custom warriors',           false,   false,   true],
      ['PDF export',                false,   false,   true],
    ];

    const cell = (val, tier) => {
      const hl = tier === currentTier ? ' tier-current' : '';
      if (val === true)  return `<td class="tier-cell${hl} tier-yes">\u2713</td>`;
      if (val === false) return `<td class="tier-cell${hl} tier-no">\u2717</td>`;
      return `<td class="tier-cell${hl}">${val}</td>`;
    };

    const rows = features.map(([name, free, std, pro]) =>
      `<tr><td class="tier-feature">${name}</td>${cell(free,'free')}${cell(std,'standard')}${cell(pro,'pro')}</tr>`
    ).join('');

    const thClass = (t) => t === currentTier ? 'tier-th tier-th-current' : 'tier-th';

    container.innerHTML = `
      <div class="tier-overview-header">
        <h2>Plans</h2>
        <button class="btn btn-sm" onclick="UI.goBack()">&#8592; Back</button>
      </div>
      ${Cloud.isSignedIn() ? `<p class="text-dim" style="margin-bottom:1rem;">Your current plan: <span class="tier-badge tier-${currentTier}">${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}</span></p>` : '<p class="text-dim" style="margin-bottom:1rem;">Sign in to access tier features.</p>'}
      <div class="tier-table-wrap">
        <table class="tier-table">
          <thead>
            <tr>
              <th class="tier-feature-th">Feature</th>
              <th class="${thClass('free')}">Free</th>
              <th class="${thClass('standard')}">Standard</th>
              <th class="${thClass('pro')}">Pro</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="text-dim" style="margin-top:1rem; font-size:0.8rem;">To upgrade your plan, contact the administrator.</p>
    `;
  },

  // === NAVIGATION ===
  goBack() {
    this.currentRoster = null;
    this.showView('roster-list');
    this.renderRosterList();
  },

  // === TABS ===
  switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
  },

  // === SECTION TOGGLE ===
  toggleSection(sectionId) {
    const header = document.querySelector(`#${sectionId} .section-header`);
    const content = document.querySelector(`#${sectionId} .section-content`);
    if (header && content) {
      header.classList.toggle('collapsed');
      content.classList.toggle('collapsed');
    }
  },

  // === TOAST ===
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // === CLOSE MODALS ===
  closeModal(id) {
    document.getElementById(id).classList.remove('active');
  },

  // === GLOBAL EVENTS ===
  bindGlobalEvents() {
    // Theme toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', () => this.toggleTheme());

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });

    // Close confirm overlay
    document.getElementById('confirm-no').addEventListener('click', () => {
      document.getElementById('confirm-overlay').classList.remove('active');
    });

    // Roster name inline edit
    document.getElementById('editor-roster-name').addEventListener('change', (e) => {
      if (this.currentRoster) {
        this.currentRoster.name = e.target.value.trim() || 'Unnamed Warband';
        this.saveCurrentRoster();
      }
    });

    // Tooltip system (delegated, uses fixed-position element on body)
    let tooltipEl = null;
    document.addEventListener('mouseenter', (e) => {
      const tag = e.target.closest('[data-tooltip]');
      if (!tag) return;
      const text = tag.getAttribute('data-tooltip');
      if (!text) return;

      if (tooltipEl) tooltipEl.remove();
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tooltip-popup';
      tooltipEl.textContent = text;
      document.body.appendChild(tooltipEl);

      const rect = tag.getBoundingClientRect();
      const ttRect = tooltipEl.getBoundingClientRect();
      let left = rect.left;
      let top = rect.top - ttRect.height - 8;

      // Keep within viewport horizontally
      if (left + ttRect.width > window.innerWidth - 8) {
        left = window.innerWidth - ttRect.width - 8;
      }
      if (left < 8) left = 8;

      // If no room above, show below
      if (top < 8) {
        top = rect.bottom + 8;
      }

      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
    }, true);

    document.addEventListener('mouseleave', (e) => {
      if (e.target.closest('[data-tooltip]') && tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
      }
    }, true);
  },

  // === UTILITY ===
  esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  escAttr(str) {
    return this.esc(str).replace(/"/g, '&quot;');
  }
};
