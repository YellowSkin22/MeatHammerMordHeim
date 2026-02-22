// UI rendering and event handling
const UI = {
  currentRoster: null,

  init() {
    this.bindGlobalEvents();
    this.showView('roster-list');
    this.renderRosterList();
  },

  // === VIEWS ===
  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    // Update header
    const backBtn = document.getElementById('btn-back');
    if (viewId === 'roster-list') {
      backBtn.classList.add('hidden');
    } else {
      backBtn.classList.remove('hidden');
    }
  },

  // === ROSTER LIST ===
  renderRosterList() {
    const rosters = Storage.getAllRosters();
    const grid = document.getElementById('roster-grid');

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
      const warband = DataService.getWarband(r.warbandId);
      const memberCount = RosterModel.getMemberCount(r);
      const rating = RosterModel.calculateWarbandRating(r);
      return `
        <div class="roster-card" onclick="UI.openRoster('${r.id}')">
          <div class="roster-card-name">${this.esc(r.name)}</div>
          <div class="roster-card-warband">${warband ? warband.name : r.warbandId}</div>
          <div class="roster-card-stats">
            <div class="roster-card-stat">Members: <strong>${memberCount}</strong></div>
            <div class="roster-card-stat">Rating: <strong>${rating}</strong></div>
            <div class="roster-card-stat">Gold: <strong>${r.gold}</strong></div>
            <div class="roster-card-stat">Battles: <strong>${r.battleLog.length}</strong></div>
          </div>
          <div class="roster-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-sm" onclick="UI.exportRoster('${r.id}')">Export</button>
            <button class="btn btn-sm btn-danger" onclick="UI.confirmDeleteRoster('${r.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  },

  // === CREATE ROSTER MODAL ===
  openCreateModal() {
    const modal = document.getElementById('create-modal');
    const select = document.getElementById('create-warband-select');
    select.innerHTML = '<option value="">-- Select Warband --</option>' +
      DataService.warbands.map(w => `<option value="${w.id}">${w.name} (${w.source})</option>`).join('');
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
    const warband = DataService.getWarband(id);
    desc.textContent = warband ? `${warband.description} Starting gold: ${warband.startingGold} gc.` : '';
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
    const warband = DataService.getWarband(r.warbandId);
    const memberCount = RosterModel.getMemberCount(r);
    const rating = RosterModel.calculateWarbandRating(r);
    const totalSpent = RosterModel.calculateTotalCost(r);

    // Header
    document.getElementById('editor-roster-name').value = r.name;
    document.getElementById('editor-warband-type').textContent = warband ? warband.name : r.warbandId;

    // Summary
    document.getElementById('summary-members').textContent = `${memberCount} / ${warband.maxWarband}`;
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
    const warband = DataService.getWarband(r.warbandId);

    // Heroes section
    const heroesContent = document.getElementById('heroes-content');
    if (r.heroes.length === 0) {
      heroesContent.innerHTML = '<p class="text-dim" style="padding: 0.5rem 0;">No heroes recruited yet.</p>';
    } else {
      heroesContent.innerHTML = r.heroes.map((h, idx) => this.renderWarriorCard(h, idx, true)).join('');
    }

    // Hero add buttons
    const heroAddContainer = document.getElementById('hero-add-buttons');
    heroAddContainer.innerHTML = warband.heroes.map(ht => {
      const currentCount = r.heroes.filter(h => h.type === ht.type).length;
      const disabled = currentCount >= ht.max ? 'disabled' : '';
      return `<button class="btn btn-sm btn-primary" ${disabled} onclick="event.stopPropagation(); UI.addWarrior('${ht.type}', true)">${ht.name} (${ht.cost} gc)</button>`;
    }).join(' ');

    // Henchmen section
    const henchmenContent = document.getElementById('henchmen-content');
    if (r.henchmen.length === 0) {
      henchmenContent.innerHTML = '<p class="text-dim" style="padding: 0.5rem 0;">No henchmen recruited yet.</p>';
    } else {
      henchmenContent.innerHTML = r.henchmen.map((h, idx) => this.renderWarriorCard(h, idx, false)).join('');
    }

    // Henchmen add buttons
    const henchAddContainer = document.getElementById('henchmen-add-buttons');
    henchAddContainer.innerHTML = warband.henchmen.map(ht => {
      return `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); UI.addWarrior('${ht.type}', false)">${ht.name} (${ht.cost} gc)</button>`;
    }).join(' ');
  },

  renderWarriorCard(warrior, index, isHero) {
    const eqCost = warrior.equipment.reduce((sum, eq) => {
      const item = DataService.getEquipmentItem(eq.id);
      return sum + (item ? item.cost : 0);
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

    const listType = isHero ? 'heroes' : 'henchmen';

    return `
      <div class="warrior-card" id="warrior-${warrior.id}">
        <div class="warrior-card-header" onclick="UI.toggleWarriorCard('${warrior.id}')">
          <div>
            <span class="warrior-name">${this.esc(warrior.name)}</span>
            <span class="warrior-type">${warrior.typeName}</span>
          </div>
          <span class="warrior-cost">${totalCost} gc</span>
        </div>
        <div class="warrior-card-body" id="warrior-body-${warrior.id}">
          <div class="form-group">
            <input type="text" class="inline-edit" value="${this.esc(warrior.name)}"
              onchange="UI.renameWarrior('${listType}', ${index}, this.value)" style="font-weight:600; font-size: 0.95rem; width: 100%;">
          </div>

          <div class="stat-line">
            ${['M','WS','BS','S','T','W','I','A','Ld'].map(stat => {
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
            <div class="tag-list">${warrior.specialRules.map(sr => `<span class="tag">${sr}</span>`).join('')}</div>
          </div>` : ''}

          <div class="tag-section mt-1">
            <div class="tag-section-label">Equipment</div>
            <div class="tag-list">
              ${warrior.equipment.map((eq, eqIdx) => {
                const itemData = DataService.getEquipmentItem(eq.id);
                const tooltip = itemData ? this.esc(itemData.rules) : '';
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

          <div class="tag-section mt-1">
            <div class="tag-section-label">Injuries</div>
            <div class="tag-list">
              ${warrior.injuries.map((inj, injIdx) => `
                <span class="tag injury">${inj.name} <span class="tag-remove" onclick="UI.removeInjury('${listType}', ${index}, ${injIdx})">x</span></span>
              `).join('')}
              <button class="btn btn-sm" onclick="UI.openInjuryModal('${listType}', ${index})">+ Add</button>
            </div>
          </div>

          <div class="warrior-actions">
            <button class="btn btn-sm" onclick="UI.adjustExp('${listType}', ${index}, 1)">+1 XP</button>
            <button class="btn btn-sm" onclick="UI.adjustExp('${listType}', ${index}, -1)">-1 XP</button>
            <button class="btn btn-sm" onclick="UI.openStatAdjust('${listType}', ${index})">Adjust Stats</button>
            ${!isHero ? `
              <button class="btn btn-sm" onclick="UI.adjustGroupSize(${index}, 1)">+1 Member</button>
              <button class="btn btn-sm" onclick="UI.adjustGroupSize(${index}, -1)">-1 Member</button>
            ` : ''}
            <button class="btn btn-sm btn-danger" onclick="UI.removeWarrior('${listType}', ${index})">Remove</button>
          </div>
        </div>
      </div>
    `;
  },

  hasSpellAccess(warrior) {
    const wizardRules = ['Wizard', 'Warrior Wizard', 'Prayers of Sigmar'];
    return warrior.specialRules.some(r => wizardRules.includes(r));
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
    const warband = DataService.getWarband(r.warbandId);

    // Validate limits
    if (isHero) {
      const template = warband.heroes.find(h => h.type === type);
      const currentCount = r.heroes.filter(h => h.type === type).length;
      if (currentCount >= template.max) {
        return this.toast(`Maximum ${template.name}s reached (${template.max}).`, 'error');
      }
    }

    const memberCount = RosterModel.getMemberCount(r);
    if (memberCount >= warband.maxWarband) {
      return this.toast(`Warband is full (${warband.maxWarband} members).`, 'error');
    }

    const warrior = RosterModel.createWarrior(type, isHero, warband);
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

  removeWarrior(listType, index) {
    const r = this.currentRoster;
    const warrior = r[listType][index];
    if (!warrior) return;
    r[listType].splice(index, 1);
    this.saveCurrentRoster();
    this.renderRosterEditor();
    this.toast(`${warrior.name} removed.`, 'info');
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
    }
  },

  // === EQUIPMENT MODAL ===
  openEquipmentModal(listType, index) {
    const r = this.currentRoster;
    const warrior = r[listType][index];
    const warband = DataService.getWarband(r.warbandId);

    const accessKey = listType === 'heroes' ? 'heroes' : 'henchmen';
    const accessibleCategories = warband.equipmentAccess[accessKey] || [];

    const modal = document.getElementById('equipment-modal');
    const body = document.getElementById('equipment-modal-body');

    let html = '';
    // Add miscellaneous always
    const allCats = [...accessibleCategories, 'miscellaneous'];
    for (const catId of allCats) {
      const items = DataService.getEquipmentByCategory(catId);
      if (items.length === 0) continue;
      const catName = DataService.equipment[catId]?.name || catId;
      html += `<h4 class="text-accent mb-1 mt-2" style="font-size:0.85rem; text-transform:uppercase;">${catName}</h4>`;
      html += '<div style="display:flex; flex-wrap:wrap; gap:0.3rem;">';
      for (const item of items) {
        html += `<button class="btn btn-sm" onclick="UI.selectEquipment('${listType}', ${index}, '${item.id}')">${item.name} (${item.cost} gc)</button>`;
      }
      html += '</div>';
    }

    body.innerHTML = html;
    modal.classList.add('active');
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
    const warband = DataService.getWarband(this.currentRoster.warbandId);
    const template = warband.heroes.find(h => h.type === warrior.type);
    const accessCategories = template ? template.skillAccess : [];

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
    const warband = DataService.getWarband(this.currentRoster.warbandId);
    const template = warband.heroes.find(h => h.type === warrior.type);
    const spellLists = template && template.spellAccess ? template.spellAccess : [];

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
        html += '<button class="btn btn-sm" ' + disabled + ' onclick="UI.selectSpell(\'' + listType + '\', ' + index + ', \'' + spell.id + '\')" title="' + this.esc(spell.description) + '">' + spell.name + ' (' + diff + ')</button>';
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
    const warrior = this.currentRoster[listType][index];
    const isHero = listType === 'heroes';
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

    const stats = ['M','WS','BS','S','T','W','I','A','Ld'];
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
    if (newSize > 5) return this.toast('Maximum group size is 5.', 'error');
    henchman.groupSize = newSize;
    this.saveCurrentRoster();
    this.renderRosterEditor();
  },

  // === PROGRESS TAB ===
  renderProgressTab() {
    const r = this.currentRoster;
    const rating = RosterModel.calculateWarbandRating(r);

    // Rating
    document.getElementById('progress-rating').textContent = rating;

    // Gold management
    document.getElementById('gold-input').value = r.gold;
    document.getElementById('wyrdstone-input').value = r.wyrdstone;

    // Battle log
    this.renderBattleLog();

    // Notes
    document.getElementById('roster-notes').value = r.notes || '';
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

  addBattle() {
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
    this.currentRoster.notes = document.getElementById('roster-notes').value;
    this.saveCurrentRoster();
  },

  // === EXPORT / IMPORT ===
  exportRoster(id) {
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
  },

  // === UTILITY ===
  esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
