document.addEventListener('DOMContentLoaded', () => {
    // Navigation Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });

    // 1. Initialize Weapon Database Data
    // WEAPONS_DATA is loaded from data.js
    if (typeof WEAPONS_DATA === 'undefined') {
        console.error("WEAPONS_DATA is not defined. Make sure data.js is loaded first.");
        return;
    }

    let sourceData = [];
    const localData = localStorage.getItem('ENDFIELD_WEAPONS_CUSTOM');
    if (localData) {
        try {
            sourceData = JSON.parse(localData);
        } catch (e) {
            console.error("Failed to parse custom weapons from localStorage, falling back to data.js", e);
            sourceData = [...WEAPONS_DATA];
        }
    } else {
        sourceData = [...WEAPONS_DATA];
    }

    // Sort database by weapon_type (specified order), rarity (★6, ★5), and numeric ID
    const typeOrder = ['片手剣', '大剣', '長柄武器', '拳銃', 'アーツユニット'];
    
    const parseIdNum = (id) => {
        if (!id) return 999;
        const match = String(id).match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : 999;
    };

    const db = [...sourceData].sort((a, b) => {
        // 1. Weapon Type Order
        const idxA = typeOrder.indexOf(a.weapon_type);
        const idxB = typeOrder.indexOf(b.weapon_type);
        const valA = idxA !== -1 ? idxA : 99;
        const valB = idxB !== -1 ? idxB : 99;
        if (valA !== valB) return valA - valB;

        // 2. Rarity Descending (Do not scatter ★6 and ★5)
        if (b.rarity !== a.rarity) return b.rarity - a.rarity;

        // 3. ID Ascending (numerical)
        return parseIdNum(a.id) - parseIdNum(b.id);
    });

    // Extract unique values for filters
    const uniqueAreas = new Set();
    const uniqueBases = new Set();
    const uniqueExtras = new Set();
    const uniqueSkills = new Set();
    const uniqueCharacters = new Set();
    const uniqueTypes = new Set();

    db.forEach(w => {
        if (w.areas && Array.isArray(w.areas)) {
            w.areas.forEach(a => uniqueAreas.add(a));
        }
        if (w.base_effect) uniqueBases.add(w.base_effect);
        if (w.extra_effect) uniqueExtras.add(w.extra_effect);
        if (w.skill_effect) uniqueSkills.add(w.skill_effect);
        if (w.character) uniqueCharacters.add(w.character);
        if (w.weapon_type) uniqueTypes.add(w.weapon_type);
    });

    const areaOrder = ["中枢エリア", "原石研究パーク", "鉱山エリア", "エネルギー高地", "武陵城", "清波砦", "首礎", "実験区域"];
    const sortedAreas = Array.from(uniqueAreas).sort((a, b) => {
        const idxA = areaOrder.indexOf(a);
        const idxB = areaOrder.indexOf(b);
        return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });
    const sortedBases = Array.from(uniqueBases).sort();
    const sortedExtras = Array.from(uniqueExtras).sort();
    const sortedSkills = Array.from(uniqueSkills).sort();
    const sortedCharacters = Array.from(uniqueCharacters).sort();
    const sortedTypes = Array.from(uniqueTypes).sort((a, b) => {
        const idxA = typeOrder.indexOf(a);
        const idxB = typeOrder.indexOf(b);
        return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
    });

    // ==========================================
    // SECTION A: Synergy Finder Setup & Logic
    // ==========================================
    const weaponSelect = document.getElementById('weapon-select');
    const quickSelectList = document.getElementById('quick-select-list');
    const selectedWeaponContainer = document.getElementById('selected-weapon-container');
    const synergyResultsContainer = document.getElementById('synergy-results');

    // Populate weapon select options
    // Group options by Weapon Type
    const typeGroups = {};
    typeOrder.forEach(type => {
        const group = document.createElement('optgroup');
        group.label = type;
        typeGroups[type] = group;
        weaponSelect.appendChild(group);
    });

    db.forEach(w => {
        const option = document.createElement('option');
        option.value = w.id;
        option.textContent = `${w.weapon_name} (★${w.rarity} / ${w.character})`;
        
        const group = typeGroups[w.weapon_type];
        if (group) {
            group.appendChild(option);
        }
    });

    // Populate Quick Select List in Sidebar
    function renderQuickSelectList() {
        quickSelectList.innerHTML = '';
        db.forEach(w => {
            const btn = document.createElement('button');
            btn.className = 'quick-item-btn';
            btn.setAttribute('data-id', w.id);
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = w.weapon_name;
            nameSpan.style.fontWeight = '600';
            
            const badgeSpan = document.createElement('span');
            badgeSpan.textContent = w.character;
            badgeSpan.style.fontSize = '0.75rem';
            badgeSpan.style.opacity = '0.7';
            badgeSpan.style.marginLeft = '0.5rem';
            
            const leftPart = document.createElement('div');
            leftPart.appendChild(nameSpan);
            leftPart.appendChild(badgeSpan);
            btn.appendChild(leftPart);

            const starSpan = document.createElement('span');
            starSpan.textContent = '★' + w.rarity;
            starSpan.style.color = w.rarity === 6 ? 'var(--rarity-6)' : 'var(--rarity-5)';
            starSpan.style.fontSize = '0.8rem';
            btn.appendChild(starSpan);

            btn.addEventListener('click', () => {
                weaponSelect.value = w.id;
                handleWeaponChange(w.id);
            });
            
            quickSelectList.appendChild(btn);
        });
    }

    renderQuickSelectList();

    let isInitialLoad = true;
    let currentOptimizerMode = 'target'; // 'target' (狙い撃ち) or 'synergy' (同時収集)

    // Handle Weapon Selection Change
    function handleWeaponChange(weaponId) {
        // Highlight active sidebar item
        document.querySelectorAll('.quick-item-btn').forEach(btn => {
            if (btn.getAttribute('data-id') === weaponId) {
                btn.classList.add('active');
                if (!isInitialLoad) {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } else {
                btn.classList.remove('active');
            }
        });

        const selected = db.find(w => w.id === weaponId);
        if (!selected) return;

        // Render Selected Weapon card
        renderSelectedWeaponCard(selected);

        // Render Synergy Results by Area
        renderSynergyResults(selected);

        // Render Optimizer Mode Switcher
        renderOptimizerModeSwitcher(selected);
    }

    function renderOptimizerModeSwitcher(selected) {
        const container = document.getElementById('optimizer-mode-container');
        if (!container) return;

        if (!selected.areas || selected.areas.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="optimizer-panel" style="margin-top: 1rem; padding: 1.25rem;">
                <div class="optimizer-title" style="margin-bottom: 0.75rem; font-size: 0.9rem;">
                    <i>🎯</i> オプティマイザーモード設定
                </div>
                <div class="optimizer-modes" style="margin-bottom: 0;">
                    <button class="mode-btn ${currentOptimizerMode === 'target' ? 'active' : ''}" data-mode="target">狙い撃ち</button>
                    <button class="mode-btn ${currentOptimizerMode === 'synergy' ? 'active' : ''}" data-mode="synergy">同時収集</button>
                </div>
            </div>
        `;

        container.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentOptimizerMode = btn.getAttribute('data-mode');
                renderOptimizerModeSwitcher(selected);
                renderSynergyResults(selected);
            });
        });
    }

    function renderSelectedWeaponCard(w) {
        const isSpecialChar = w.character !== '汎用';
        selectedWeaponContainer.innerHTML = `
            <div class="selected-weapon-card rarity-${w.rarity}">
                <div class="card-header-main">
                    <div>
                        <div class="weapon-title">${w.weapon_name}</div>
                        <div class="stars">
                            ${Array(w.rarity).fill('<span class="star-icon">★</span>').join('')}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
                        <span class="char-badge ${isSpecialChar ? 'special' : ''}">
                            ${w.character}
                        </span>
                        <span class="type-badge">
                            ${w.weapon_type || '-'}
                        </span>
                    </div>
                </div>
                <div class="weapon-effects-list">
                    <div class="effect-row">
                        <span class="effect-label">基礎効果</span>
                        <span class="effect-val effect-base">${w.base_effect || '-'}</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">付加効果</span>
                        <span class="effect-val effect-extra">${w.extra_effect || '-'}</span>
                    </div>
                    <div class="effect-row">
                        <span class="effect-label">スキル効果</span>
                        <span class="effect-val effect-skill">${w.skill_effect || '-'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSynergyResults(selected) {
        synergyResultsContainer.innerHTML = '';

        if (!selected.areas || selected.areas.length === 0) {
            synergyResultsContainer.innerHTML = `
                <div class="panel">
                    <div class="no-match-state">
                        <i>🗺️</i>
                        <div>この武器のドロップエリア情報がありません。</div>
                    </div>
                </div>
            `;
            return;
        }

        const allBaseEffects = Array.from(uniqueBases);

        // Loop through each drop area of the selected weapon
        selected.areas.forEach(areaName => {
            const areaContainer = document.createElement('div');
            areaContainer.className = 'area-container';

            // Find other weapons in the SAME area
            const weaponsInArea = db.filter(w => w.areas && w.areas.includes(areaName));
            const otherWeapons = weaponsInArea.filter(w => w.id !== selected.id);

            // --- 1. OPTIMIZER LOGIC (Calculated per Area) ---
            let recommendedBases = [];
            let recommendedExtraSkill = null;
            let candidateES = [];

            if (selected.extra_effect) {
                candidateES.push({ type: 'extra', value: selected.extra_effect });
            }
            if (selected.skill_effect) {
                candidateES.push({ type: 'skill', value: selected.skill_effect });
            }

            const simulateFilter = (bases, es) => {
                return weaponsInArea.filter(w => {
                    const baseMatches = bases.includes(w.base_effect);
                    const esMatches = es ? (w.extra_effect === es.value || w.skill_effect === es.value) : false;
                    return baseMatches || esMatches;
                });
            };

            if (currentOptimizerMode === 'target') {
                // 狙い撃ちモード
                let bestES = null;
                let minCount = Infinity;

                if (candidateES.length > 0) {
                    candidateES.forEach(es => {
                        const matches = simulateFilter([selected.base_effect], es);
                        if (matches.length < minCount) {
                            minCount = matches.length;
                            bestES = es;
                        }
                    });
                }
                recommendedExtraSkill = bestES;

                recommendedBases.push(selected.base_effect);

                const baseCounts = {};
                allBaseEffects.forEach(b => {
                    if (b !== selected.base_effect) {
                        baseCounts[b] = 0;
                    }
                });
                otherWeapons.forEach(w => {
                    if (w.base_effect !== selected.base_effect && baseCounts[w.base_effect] !== undefined) {
                        baseCounts[w.base_effect]++;
                    }
                });

                const sortedDummies = Object.keys(baseCounts).sort((a, b) => baseCounts[a] - baseCounts[b]);
                for (let i = 0; i < 2 && i < sortedDummies.length; i++) {
                    recommendedBases.push(sortedDummies[i]);
                }
            } else {
                // 同時収集モード
                let bestES = null;
                let maxCount = -1;

                if (candidateES.length > 0) {
                    candidateES.forEach(es => {
                        const matches = otherWeapons.filter(w => w.extra_effect === es.value || w.skill_effect === es.value);
                        if (matches.length > maxCount) {
                            maxCount = matches.length;
                            bestES = es;
                        }
                    });
                }
                recommendedExtraSkill = bestES;

                recommendedBases.push(selected.base_effect);

                const synergyWeaponsWithES = otherWeapons.filter(w => {
                    if (!recommendedExtraSkill) return false;
                    return w.extra_effect === recommendedExtraSkill.value || w.skill_effect === recommendedExtraSkill.value;
                });

                const synergyBaseCounts = {};
                synergyWeaponsWithES.forEach(w => {
                    if (w.base_effect !== selected.base_effect) {
                        synergyBaseCounts[w.base_effect] = (synergyBaseCounts[w.base_effect] || 0) + 1;
                    }
                });

                const sortedSynergyBases = Object.keys(synergyBaseCounts).sort((a, b) => synergyBaseCounts[b] - synergyBaseCounts[a]);
                sortedSynergyBases.forEach(b => {
                    if (recommendedBases.length < 3) {
                        recommendedBases.push(b);
                    }
                });

                if (recommendedBases.length < 3) {
                    const areaBaseCounts = {};
                    otherWeapons.forEach(w => {
                        if (!recommendedBases.includes(w.base_effect)) {
                            areaBaseCounts[w.base_effect] = (areaBaseCounts[w.base_effect] || 0) + 1;
                        }
                    });
                    const sortedAreaBases = Object.keys(areaBaseCounts).sort((a, b) => areaBaseCounts[b] - areaBaseCounts[a]);
                    sortedAreaBases.forEach(b => {
                        if (recommendedBases.length < 3) {
                            recommendedBases.push(b);
                        }
                    });
                }

                if (recommendedBases.length < 3) {
                    allBaseEffects.forEach(b => {
                        if (recommendedBases.length < 3 && !recommendedBases.includes(b)) {
                            recommendedBases.push(b);
                        }
                    });
                }
            }

            const matchedWeaponsForFilter = simulateFilter(recommendedBases, recommendedExtraSkill);
            const totalWeaponsCount = weaponsInArea.length;
            const matchedCount = matchedWeaponsForFilter.length;

            // Compute matches for the traditional list (showing matches between other weapons and selected weapon)
            const matchedWeapons = [];
            otherWeapons.forEach(w => {
                let matchCount = 0;
                const matches = { base: false, extra: false, skill: false };

                if (w.base_effect && w.base_effect === selected.base_effect) {
                    matchCount++;
                    matches.base = true;
                }
                if (w.extra_effect && w.extra_effect === selected.extra_effect) {
                    matchCount++;
                    matches.extra = true;
                }
                if (w.skill_effect && w.skill_effect === selected.skill_effect) {
                    matchCount++;
                    matches.skill = true;
                }

                if (matchCount > 0) {
                    matchedWeapons.push({
                        weapon: w,
                        matchCount,
                        matches
                    });
                }
            });

            // --- 2. RENDER AREA HEADER ---
            const areaHeader = document.createElement('div');
            areaHeader.className = 'area-header';

            const titleGroup = document.createElement('div');
            titleGroup.className = 'area-title-group';

            const areaIcon = document.createElement('span');
            areaIcon.className = 'area-icon';
            areaIcon.textContent = '📍';

            const areaNameSpan = document.createElement('span');
            areaNameSpan.className = 'area-name';
            areaNameSpan.textContent = areaName;

            titleGroup.appendChild(areaIcon);
            titleGroup.appendChild(areaNameSpan);

            const countSummary = document.createElement('span');
            countSummary.className = 'matching-count-summary';
            countSummary.textContent = `一致する武器: ${matchedWeapons.length}件`;

            areaHeader.appendChild(titleGroup);
            areaHeader.appendChild(countSummary);
            areaContainer.appendChild(areaHeader);

            // --- 3. RENDER INTEGRATED OPTIMIZER BOX ---
            const baseBadgesHTML = recommendedBases.map(b => {
                const isDummy = b !== selected.base_effect;
                const badgeClass = isDummy ? 'opt-badge dummy-opt' : 'opt-badge base-opt';
                const label = isDummy ? `${b} (ダミー)` : b;
                return `<span class="${badgeClass}">${label}</span>`;
            }).join(' ');

            let esBadgeHTML = '';
            if (recommendedExtraSkill) {
                const badgeClass = recommendedExtraSkill.type === 'extra' ? 'opt-badge extra-opt' : 'opt-badge skill-opt';
                const typeLabel = recommendedExtraSkill.type === 'extra' ? '付加' : 'スキル';
                esBadgeHTML = `<span class="${badgeClass}">${typeLabel}: ${recommendedExtraSkill.value}</span>`;
            } else {
                esBadgeHTML = `<span class="opt-badge dummy-opt">効果なし (ダミー)</span>`;
            }

            const optimizerWrapper = document.createElement('div');
            optimizerWrapper.className = 'optimizer-panel-embedded';
            optimizerWrapper.style.margin = '0 0 1.25rem 0';
            optimizerWrapper.style.padding = '1rem';
            optimizerWrapper.style.background = 'rgba(0, 0, 0, 0.22)';
            optimizerWrapper.style.border = '1px dashed rgba(242, 169, 0, 0.25)';
            optimizerWrapper.style.borderRadius = '8px';

            optimizerWrapper.innerHTML = `
                <div class="optimizer-title" style="margin-bottom: 0.5rem; font-size: 0.8rem; opacity: 0.9;">
                    <i>🎯</i> 推奨ドロップフィルター設定
                </div>
                <div class="optimizer-slots">
                    <div class="optimizer-slot-row">
                        <span class="slot-label" style="width: 75px;">基礎効果 (3)</span>
                        <div class="slot-badges">${baseBadgesHTML}</div>
                    </div>
                    <div class="optimizer-slot-row">
                        <span class="slot-label" style="width: 75px;">付加/スキル (1)</span>
                        <div class="slot-badges">${esBadgeHTML}</div>
                    </div>
                </div>
                <div class="optimizer-efficiency" style="margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.03);">
                    <span class="efficiency-text">ドロップ候補の絞り込み:</span>
                    <span class="efficiency-value">
                        ${totalWeaponsCount}種 <span class="arrow">➔</span> ${matchedCount}種
                    </span>
                </div>
            `;
            areaContainer.appendChild(optimizerWrapper);

            // --- 4. RENDER SYNERGY WEAPONS TREE ---
            const treeTitle = document.createElement('div');
            treeTitle.className = 'synergy-tree-title';
            treeTitle.style.fontSize = '0.75rem';
            treeTitle.style.color = 'var(--text-secondary)';
            treeTitle.style.fontWeight = '600';
            treeTitle.style.marginBottom = '0.5rem';
            treeTitle.innerHTML = `▼ 効果一致する他の武器`;
            areaContainer.appendChild(treeTitle);

            const hasAnyMatch = matchedWeapons.length > 0;

            if (!hasAnyMatch) {
                const noMatch = document.createElement('div');
                noMatch.className = 'no-match-state';
                noMatch.innerHTML = `
                    <i>🔍</i>
                    <div>このエリアに効果が一致する他の武器はありません。</div>
                `;
                areaContainer.appendChild(noMatch);
            } else {
                // Render match groups
                const matchGroupsWrapper = document.createElement('div');
                matchGroupsWrapper.className = 'match-groups-wrapper';

                // Display 3, then 2, then 1
                [3, 2, 1].forEach(count => {
                    const weaponsInGroup = matchedWeapons.filter(item => item.matchCount === count);
                    if (weaponsInGroup.length === 0) return; // Only render if there are weapons in the group

                    const groupSection = document.createElement('div');
                    groupSection.className = `match-group-section match-level-${count}`;

                    // Group Section Header
                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'match-group-header';

                    let badgeColor = '';
                    if (count === 3) badgeColor = 'var(--rarity-6)';
                    else if (count === 2) badgeColor = 'var(--rarity-5)';
                    else badgeColor = 'var(--accent)';

                    groupHeader.innerHTML = `
                        <div class="match-group-title">
                            <span class="match-group-indicator" style="background-color: ${badgeColor};"></span>
                            <span class="match-group-label">${count}個効果一致</span>
                        </div>
                        <span class="match-group-count">${weaponsInGroup.length}件</span>
                    `;
                    groupSection.appendChild(groupHeader);

                    // Group weapons inside this match count by matched combination
                    const getComboKeyAndLabel = (matches) => {
                        const keys = [];
                        const labels = [];
                        if (matches.base) {
                            keys.push('base');
                            labels.push(`基礎: ${selected.base_effect || '-'}`);
                        }
                        if (matches.extra) {
                            keys.push('extra');
                            labels.push(`付加: ${selected.extra_effect || '-'}`);
                        }
                        if (matches.skill) {
                            keys.push('skill');
                            labels.push(`スキル: ${selected.skill_effect || '-'}`);
                        }
                        
                        return {
                            key: keys.join(','),
                            label: labels.join('、'),
                            matches: { ...matches }
                        };
                    };

                    const combosMap = {};
                    weaponsInGroup.forEach(item => {
                        const combo = getComboKeyAndLabel(item.matches);
                        const comboKey = combo.key;
                        if (!combosMap[comboKey]) {
                            combosMap[comboKey] = {
                                key: comboKey,
                                label: combo.label,
                                matches: combo.matches,
                                items: []
                            };
                        }
                        combosMap[comboKey].items.push(item);
                    });

                    // Sort combos in logical order by key
                    const keyOrder = [
                        'base,extra,skill',
                        'base,extra',
                        'base,skill',
                        'extra,skill',
                        'base',
                        'extra',
                        'skill'
                    ];

                    const combos = Object.values(combosMap);
                    combos.sort((a, b) => {
                        const idxA = keyOrder.indexOf(a.key);
                        const idxB = keyOrder.indexOf(b.key);
                        return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
                    });

                    // Container for combo nodes
                    const comboList = document.createElement('div');
                    comboList.className = 'combo-list';

                    combos.forEach(combo => {
                        // Sort weapons: type, rarity desc, then numeric ID
                        combo.items.sort((a, b) => {
                            // 1. Weapon Type Order
                            const idxA = typeOrder.indexOf(a.weapon.weapon_type);
                            const idxB = typeOrder.indexOf(b.weapon.weapon_type);
                            const valA = idxA !== -1 ? idxA : 99;
                            const valB = idxB !== -1 ? idxB : 99;
                            if (valA !== valB) return valA - valB;

                            // 2. Rarity Descending
                            if (b.weapon.rarity !== a.weapon.rarity) {
                                return b.weapon.rarity - a.weapon.rarity;
                            }

                            // 3. ID Ascending (numerical)
                            return parseIdNum(a.weapon.id) - parseIdNum(b.weapon.id);
                        });

                        const comboItem = document.createElement('div');
                        comboItem.className = 'combo-item';

                        // Create combination label with tree connector └
                        const comboHeader = document.createElement('div');
                        comboHeader.className = 'combo-header';
                        
                        comboHeader.innerHTML = `
                            <span class="connector-branch">└</span>
                            <span class="combo-label">${combo.label}</span>
                        `;
                        comboItem.appendChild(comboHeader);

                        // Create weapons list under this combination
                        const weaponsList = document.createElement('div');
                        weaponsList.className = 'combo-weapons-list';

                        combo.items.forEach(item => {
                            const w = item.weapon;
                            const weaponRow = document.createElement('div');
                            weaponRow.className = `matching-weapon-row rarity-${w.rarity}`;
                            weaponRow.setAttribute('data-id', w.id);

                            weaponRow.innerHTML = `
                                <span class="sub-connector-branch">└</span>
                                <div class="weapon-row-details">
                                    <div class="weapon-row-top">
                                        <span class="weapon-row-rarity">★${w.rarity}</span>
                                        <span class="weapon-row-name">${w.weapon_name}</span>
                                    </div>
                                    <div class="weapon-row-bottom">
                                        <span class="weapon-row-char">${w.character}</span>
                                    </div>
                                </div>
                            `;

                            // Click row to change selection
                            weaponRow.addEventListener('click', () => {
                                weaponSelect.value = w.id;
                                handleWeaponChange(w.id);
                            });

                            weaponsList.appendChild(weaponRow);
                        });

                        comboItem.appendChild(weaponsList);
                        comboList.appendChild(comboItem);
                    });

                    groupSection.appendChild(comboList);
                    matchGroupsWrapper.appendChild(groupSection);
                });

                areaContainer.appendChild(matchGroupsWrapper);
            }

            synergyResultsContainer.appendChild(areaContainer);
        });
    }

    // Bind dropdown change event
    weaponSelect.addEventListener('change', (e) => {
        handleWeaponChange(e.target.value);
    });

    // Select first weapon by default
    if (db.length > 0) {
        weaponSelect.value = db[0].id;
        handleWeaponChange(db[0].id);
        isInitialLoad = false;
    }


    // ==========================================
    // SECTION B: Full DB Explorer Logic
    // ==========================================
    const searchInput = document.getElementById('search-input');
    const filterArea = document.getElementById('filter-area');
    const filterRarity = document.getElementById('filter-rarity');
    const filterChar = document.getElementById('filter-char');
    const filterType = document.getElementById('filter-type');
    const filterBase = document.getElementById('filter-base');
    const filterExtra = document.getElementById('filter-extra');
    const filterSkill = document.getElementById('filter-skill');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const statsTotal = document.getElementById('stats-total');
    const dbTableBody = document.querySelector('#db-table tbody');

    // Populate dropdown filters dynamically
    function populateFilterDropdowns() {
        // Area Filter
        sortedAreas.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a;
            opt.textContent = a;
            filterArea.appendChild(opt);
        });
        // Weapon Type Filter
        sortedTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            filterType.appendChild(opt);
        });
        // Character Filter
        sortedCharacters.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            filterChar.appendChild(opt);
        });
        // Base Effect Filter
        sortedBases.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            filterBase.appendChild(opt);
        });
        // Extra Effect Filter
        sortedExtras.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e;
            opt.textContent = e;
            filterExtra.appendChild(opt);
        });
        // Skill Effect Filter
        sortedSkills.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            filterSkill.appendChild(opt);
        });
    }

    populateFilterDropdowns();

    // Render Table Row
    function renderTableRow(w) {
        const tr = document.createElement('tr');
        tr.classList.add(`db-row-rarity-${w.rarity}`);
        
        const displayType = w.weapon_type === 'アーツユニット' ? 'アーツ' : (w.weapon_type || '-');
        
        tr.innerHTML = `
            <td><span class="table-w-name">${w.weapon_name}</span></td>
            <td><span class="type-badge">${displayType}</span></td>
            <td><span class="char-badge ${w.character !== '汎用' ? 'special' : ''}">${w.character}</span></td>
            <td style="text-align: right;">
                <button class="reset-btn detail-action-btn" style="display: inline-flex; padding: 0.3rem 0.75rem; font-size: 0.8rem; background: rgba(242, 169, 0, 0.1); border-color: rgba(242, 169, 0, 0.2); color: var(--primary);">詳細</button>
            </td>
        `;

        tr.style.cursor = 'pointer';
        const showDetail = (e) => {
            e.stopPropagation();
            openDetailModal(w);
        };
        tr.addEventListener('click', showDetail);
        tr.querySelector('.detail-action-btn').addEventListener('click', showDetail);

        return tr;
    }

    // Apply Filter Logic
    function applyFilters() {
        const query = searchInput.value.toLowerCase().trim();
        const area = filterArea.value;
        const rarity = filterRarity.value;
        const char = filterChar.value;
        const type = filterType.value;
        const base = filterBase.value;
        const extra = filterExtra.value;
        const skill = filterSkill.value;

        const filtered = db.filter(w => {
            // Search Query (matches weapon name, character, weapon type, base, extra, or skill effects)
            if (query) {
                const matchName = w.weapon_name.toLowerCase().includes(query);
                const matchChar = w.character.toLowerCase().includes(query);
                const matchType = w.weapon_type && w.weapon_type.toLowerCase().includes(query);
                const matchBase = w.base_effect && w.base_effect.toLowerCase().includes(query);
                const matchExtra = w.extra_effect && w.extra_effect.toLowerCase().includes(query);
                const matchSkill = w.skill_effect && w.skill_effect.toLowerCase().includes(query);
                
                if (!matchName && !matchChar && !matchType && !matchBase && !matchExtra && !matchSkill) {
                    return false;
                }
            }

            // Dropdown filters
            if (area && (!w.areas || !w.areas.includes(area))) return false;
            if (rarity && w.rarity !== parseInt(rarity)) return false;
            if (char && w.character !== char) return false;
            if (type && w.weapon_type !== type) return false;
            if (base && w.base_effect !== base) return false;
            if (extra && w.extra_effect !== extra) return false;
            if (skill && w.skill_effect !== skill) return false;

            return true;
        });

        // Update statistics
        statsTotal.textContent = `該当件数: ${filtered.length}件 / 全${db.length}件`;

        // Render table rows
        dbTableBody.innerHTML = '';
        if (filtered.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted)">条件に一致する武器データが見つかりませんでした。</td>`;
            dbTableBody.appendChild(tr);
        } else {
            filtered.forEach(w => {
                dbTableBody.appendChild(renderTableRow(w));
            });
        }
    }

    // Folding Filter Toggle
    const filterToggleBtn = document.getElementById('filter-toggle-btn');
    const filterContent = document.getElementById('filter-content');
    if (filterToggleBtn && filterContent) {
        filterToggleBtn.addEventListener('click', () => {
            const isCollapsed = filterContent.classList.contains('collapsed');
            if (isCollapsed) {
                filterContent.classList.remove('collapsed');
                filterToggleBtn.classList.remove('collapsed');
            } else {
                filterContent.classList.add('collapsed');
                filterToggleBtn.classList.add('collapsed');
            }
        });
    }

    // Bind event listeners for filters
    searchInput.addEventListener('input', applyFilters);
    filterArea.addEventListener('change', applyFilters);
    filterRarity.addEventListener('change', applyFilters);
    filterChar.addEventListener('change', applyFilters);
    filterType.addEventListener('change', applyFilters);
    filterBase.addEventListener('change', applyFilters);
    filterExtra.addEventListener('change', applyFilters);
    filterSkill.addEventListener('change', applyFilters);

    // Reset Filters Button
    resetFiltersBtn.addEventListener('click', () => {
        searchInput.value = '';
        filterArea.value = '';
        filterRarity.value = '';
        filterChar.value = '';
        filterType.value = '';
        filterBase.value = '';
        filterExtra.value = '';
        filterSkill.value = '';
        applyFilters();
    });

    // ==========================================
    // SECTION C: Weapon Database Editor Logic
    // ==========================================
    const editorTableBody = document.querySelector('#editor-table tbody');
    const weaponForm = document.getElementById('weapon-form');
    const editWeaponIdInput = document.getElementById('edit-weapon-id');
    const editNameInput = document.getElementById('edit-name');
    const editTypeInput = document.getElementById('edit-type');
    const editRarityInput = document.getElementById('edit-rarity');
    const editCharInput = document.getElementById('edit-char');
    const editBaseInput = document.getElementById('edit-base');
    const editExtraInput = document.getElementById('edit-extra');
    const editSkillInput = document.getElementById('edit-skill');
    const editAreasContainer = document.getElementById('edit-areas-container');
    const newAreaNameInput = document.getElementById('new-area-name');
    const addNewAreaBtn = document.getElementById('add-new-area-btn');
    const formActionTitle = document.getElementById('form-action-title');
    const cancelBtn = document.getElementById('cancel-btn');
    
    const exportBtn = document.getElementById('export-btn');
    const importFileInput = document.getElementById('import-file');
    const resetDbBtn = document.getElementById('reset-db-btn');

    // List of active areas that we can check/uncheck
    let activeAreasList = [...areaOrder];
    sortedAreas.forEach(a => {
        if (!activeAreasList.includes(a)) {
            activeAreasList.push(a);
        }
    });

    // Populate Datalists for suggestions
    function populateSuggestions() {
        const baseDl = document.getElementById('base-suggestions');
        const extraDl = document.getElementById('extra-suggestions');
        const skillDl = document.getElementById('skill-suggestions');

        if (baseDl) baseDl.innerHTML = '';
        if (extraDl) extraDl.innerHTML = '';
        if (skillDl) skillDl.innerHTML = '';

        sortedBases.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            if (baseDl) baseDl.appendChild(opt);
        });
        sortedExtras.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e;
            if (extraDl) extraDl.appendChild(opt);
        });
        sortedSkills.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            if (skillDl) skillDl.appendChild(opt);
        });
    }

    // Populate drop areas checklist
    function populateAreasChecklist(checkedAreas = []) {
        if (!editAreasContainer) return;
        editAreasContainer.innerHTML = '';
        activeAreasList.forEach(area => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '0.5rem';
            label.style.cursor = 'pointer';
            label.style.fontSize = '0.85rem';
            label.style.fontWeight = '500';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = area;
            checkbox.checked = checkedAreas.includes(area);
            checkbox.className = 'area-checkbox';

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(area));
            editAreasContainer.appendChild(label);
        });
    }

    // Add new custom area to checklist
    if (addNewAreaBtn) {
        addNewAreaBtn.addEventListener('click', () => {
            const newArea = newAreaNameInput.value.trim();
            if (!newArea) return;
            if (!activeAreasList.includes(newArea)) {
                activeAreasList.push(newArea);
                activeAreasList.sort((a, b) => {
                    const idxA = areaOrder.indexOf(a);
                    const idxB = areaOrder.indexOf(b);
                    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
                });
            }
            
            // Collect currently checked areas
            const currentChecked = Array.from(document.querySelectorAll('.area-checkbox:checked')).map(cb => cb.value);
            if (!currentChecked.includes(newArea)) {
                currentChecked.push(newArea);
            }

            populateAreasChecklist(currentChecked);
            newAreaNameInput.value = '';
        });
    }

    // Modal controls
    const detailModal = document.getElementById('detail-modal');
    const editModal = document.getElementById('edit-modal');
    const closeDetailModalBtn = document.getElementById('close-detail-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal');
    const addWeaponBtn = document.getElementById('add-weapon-btn');

    function openDetailModal(w) {
        const detailBody = document.getElementById('detail-modal-body');
        const isSpecialChar = w.character !== '汎用';
        
        let areasHtml = '';
        if (w.areas && w.areas.length > 0) {
            areasHtml = w.areas.map(a => `<span class="table-area-tag">${a}</span>`).join(' ');
        } else {
            areasHtml = `<span style="color: var(--text-muted)">-</span>`;
        }

        detailBody.innerHTML = `
            <div class="detail-info-list">
                <div class="detail-item">
                    <span class="detail-label">武器名</span>
                    <span class="detail-value" style="font-size: 1.15rem; color: var(--primary); font-weight: 700;">${w.weapon_name}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">レアリティ</span>
                    <span class="detail-value"><span class="badge-rarity r${w.rarity}">★${w.rarity}</span></span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">武器種</span>
                    <span class="detail-value"><span class="type-badge">${w.weapon_type || '-'}</span></span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">モチーフキャラ</span>
                    <span class="detail-value"><span class="char-badge ${isSpecialChar ? 'special' : ''}">${w.character}</span></span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">基礎効果</span>
                    <span class="detail-value base">${w.base_effect || '-'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">付加効果</span>
                    <span class="detail-value extra">${w.extra_effect || '-'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">スキル効果</span>
                    <span class="detail-value skill">${w.skill_effect || '-'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">入手エリア</span>
                    <span class="detail-value"><div class="table-areas-list">${areasHtml}</div></span>
                </div>
            </div>
        `;

        detailModal.classList.add('active');

        // Bind button actions for this weapon
        const deleteBtn = document.getElementById('detail-delete-btn');
        const editBtn = document.getElementById('detail-edit-btn');
        const synergyBtn = document.getElementById('detail-synergy-btn');

        deleteBtn.onclick = () => {
            if (confirm(`本当に「${w.weapon_name}」をデータベースから削除しますか？`)) {
                const updatedList = sourceData.filter(item => item.id !== w.id);
                localStorage.setItem('ENDFIELD_WEAPONS_CUSTOM', JSON.stringify(updatedList));
                alert("削除しました。");
                detailModal.classList.remove('active');
                window.location.reload();
            }
        };

        editBtn.onclick = () => {
            detailModal.classList.remove('active');
            openEditModal(w);
        };

        synergyBtn.onclick = () => {
            detailModal.classList.remove('active');
            const synergyTabBtn = document.querySelector('.tab-btn[data-tab="synergy"]');
            if (synergyTabBtn) synergyTabBtn.click();
            weaponSelect.value = w.id;
            handleWeaponChange(w.id);
        };
    }

    function openEditModal(w = null) {
        if (w) {
            // Edit mode
            if (formActionTitle) formActionTitle.textContent = '📝 武器データの編集';
            editWeaponIdInput.value = w.id;
            editNameInput.value = w.weapon_name;
            editTypeInput.value = w.weapon_type || '片手剣';
            editRarityInput.value = w.rarity;
            editCharInput.value = w.character;
            editBaseInput.value = w.base_effect || '';
            editExtraInput.value = w.extra_effect || '';
            editSkillInput.value = w.skill_effect || '';
            populateAreasChecklist(w.areas || []);
        } else {
            // Add mode
            if (formActionTitle) formActionTitle.textContent = '➕ 武器データの追加';
            editWeaponIdInput.value = '';
            weaponForm.reset();
            populateAreasChecklist([]);
        }
        editModal.classList.add('active');
    }

    if (closeDetailModalBtn) {
        closeDetailModalBtn.addEventListener('click', () => {
            detailModal.classList.remove('active');
        });
    }
    if (closeEditModalBtn) {
        closeEditModalBtn.addEventListener('click', () => {
            editModal.classList.remove('active');
        });
    }
    if (addWeaponBtn) {
        addWeaponBtn.addEventListener('click', () => {
            openEditModal(null);
        });
    }

    // Modal background click close
    window.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            detailModal.classList.remove('active');
        }
        if (e.target === editModal) {
            editModal.classList.remove('active');
        }
    });

    // Handle Form Submit (Add/Edit save)
    if (weaponForm) {
        weaponForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const id = editWeaponIdInput.value.trim();
            const name = editNameInput.value.trim();
            const type = editTypeInput.value;
            const rarity = parseInt(editRarityInput.value, 10);
            const char = editCharInput.value.trim();
            const base = editBaseInput.value.trim();
            const extra = editExtraInput.value.trim();
            const skill = editSkillInput.value.trim();

            // Get checked areas
            const checkedAreas = Array.from(document.querySelectorAll('.area-checkbox:checked')).map(cb => cb.value);

            if (!name || !char) {
                alert("必須フィールドを入力してください。");
                return;
            }

            const newWeapon = {
                id: id || `custom-${Date.now()}`,
                weapon_name: name,
                weapon_type: type,
                variant_type: char === '汎用' ? 'generic' : 'character_specific',
                rarity: rarity,
                character: char,
                areas: checkedAreas,
                base_effect: base || null,
                extra_effect: extra || null,
                skill_effect: skill || null,
                side: "left"
            };

            let updatedList = [];
            if (id) {
                // Edit mode
                updatedList = sourceData.map(item => item.id === id ? newWeapon : item);
                alert("武器データを更新しました。");
            } else {
                // Add mode
                updatedList = [...sourceData, newWeapon];
                alert("武器データを追加しました。");
            }

            localStorage.setItem('ENDFIELD_WEAPONS_CUSTOM', JSON.stringify(updatedList));
            window.location.reload();
        });
    }

    // Handle Cancel Click
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            weaponForm.reset();
            editWeaponIdInput.value = '';
            if (formActionTitle) formActionTitle.textContent = '➕ 武器データの追加';
            populateAreasChecklist();
            editModal.classList.remove('active');
        });
    }

    // Reset Database to data.js Defaults
    if (resetDbBtn) {
        resetDbBtn.addEventListener('click', () => {
            if (confirm("すべての編集内容（カスタム追加・編集データ）を削除し、元の data.js の初期状態に戻しますか？")) {
                localStorage.removeItem('ENDFIELD_WEAPONS_CUSTOM');
                alert("初期状態にリセットしました。");
                window.location.reload();
            }
        });
    }

    // Export data.js file
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            // Format the database array nicely
            const prettyJson = JSON.stringify(sourceData, null, 4);
            const fileContent = `const WEAPONS_DATA = ${prettyJson};`;
            
            const blob = new Blob([fileContent], { type: 'text/javascript;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "data.js");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // Import JSON/JS data file
    if (importFileInput) {
        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    let text = event.target.result.trim();
                    // Strip Javascript assignment if present
                    if (text.startsWith("const WEAPONS_DATA =")) {
                        text = text.substring("const WEAPONS_DATA =".length).trim();
                    }
                    if (text.endsWith(";")) {
                        text = text.substring(0, text.length - 1).trim();
                    }

                    const importedData = JSON.parse(text);
                    if (Array.isArray(importedData)) {
                        localStorage.setItem('ENDFIELD_WEAPONS_CUSTOM', JSON.stringify(importedData));
                        alert("インポートが正常に完了しました！");
                        window.location.reload();
                    } else {
                        alert("インポートされたデータが配列ではありません。正しいデータ形式を選択してください。");
                    }
                } catch (err) {
                    console.error(err);
                    alert("ファイルの解析に失敗しました。ファイルの内容が正しい形式（JSON または data.js）であることを確認してください。");
                }
            };
            reader.readAsText(file);
        });
    }

    // Initialize Editor tab displays
    populateSuggestions();
    populateAreasChecklist();

    // Initial render of database explorer
    applyFilters();
});
