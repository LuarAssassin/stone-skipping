import {
    forageShoreStones,
    formatStoneDimensions,
    MAX_COLLECTION_SIZE,
    type StoneBox,
    type StoneSpec,
} from '../simulation/stones';

export interface StoneDrawerCallbacks {
    onEquip(stone: StoneSpec): void;
}

/** Visual silhouette badge showing the stone's real top-down aspect & side thickness ratio. */
function silhouetteSvg(stone: StoneSpec): string {
    const maxR = Math.max(stone.a, stone.b, 0.052);
    const rx = Math.max(8, Math.round((stone.a / maxR) * 20));
    const ry = Math.max(6, Math.round((stone.b / maxR) * 16));
    const th = Math.max(2, Math.min(11, Math.round((stone.h / 0.016) * 10)));
    return `<svg class="stone-glyph" viewBox="0 0 54 44" aria-hidden="true">
      <ellipse cx="27" cy="17" rx="${rx}" ry="${ry}" fill="${stone.colorHex}" stroke="rgba(255,220,178,0.45)" stroke-width="1.2" />
      <rect x="${27 - rx}" y="${36 - Math.round(th / 2)}" width="${rx * 2}" height="${th}" rx="${Math.round(th / 2)}" fill="${stone.colorHex}" stroke="rgba(255,220,178,0.45)" stroke-width="1" />
    </svg>`;
}

export function mountStoneDrawer(box: StoneBox, callbacks: StoneDrawerCallbacks) {
    const backdrop = document.createElement('div');
    backdrop.id = 'stone-modal';
    backdrop.className = 'stone-modal';
    backdrop.innerHTML = `
      <div class="stone-sheet" role="dialog" aria-modal="true" aria-label="岸边拣石与随身石匣">
        <div class="stone-sheet-head">
          <div>
            <span class="eyebrow">SHORE FORAGING & COLLECTION</span>
            <h2>暮色岸滩 · 拣石与石匣</h2>
          </div>
          <div class="stone-sheet-head-actions">
            <span class="career-pill" id="career-skips-pill">累计 0 跳</span>
            <button id="stone-modal-close" class="icon-btn" type="button" aria-label="关闭">✕</button>
          </div>
        </div>

        <section class="stone-section">
          <div class="section-row">
            <div>
              <h3>岸边浅滩新拾</h3>
              <p class="section-sub">天然石块参差不齐——看轮廓与侧厚挑顺手的，顺手试投或收入石匣</p>
            </div>
            <button id="reforage-btn" class="ghost-amber-btn" type="button">沿岸再找找</button>
          </div>
          <div class="stone-grid" id="shore-grid"></div>
        </section>

        <section class="stone-section">
          <div class="section-row">
            <div>
              <h3>随身石匣 <span id="box-count">1 / ${MAX_COLLECTION_SIZE}</span></h3>
              <p class="section-sub">收藏的心头好永久保留，可随时按数字键 1–${MAX_COLLECTION_SIZE} 切换练习</p>
            </div>
          </div>
          <div class="stone-grid" id="collection-grid"></div>
        </section>

        <p class="stone-feedback" id="stone-feedback"></p>
      </div>
    `;
    document.querySelector('#app')!.append(backdrop);

    let shoreStones: StoneSpec[] = forageShoreStones(box.careerSkips);
    const feedbackEl = backdrop.querySelector<HTMLElement>('#stone-feedback')!;

    function setFeedback(text: string) {
        feedbackEl.textContent = text;
    }

    function render() {
        backdrop.querySelector('#career-skips-pill')!.textContent = `累计 ${box.careerSkips} 跳`;
        backdrop.querySelector('#box-count')!.textContent = `${box.stones.length} / ${MAX_COLLECTION_SIZE}`;

        const shoreGrid = backdrop.querySelector('#shore-grid')!;
        shoreGrid.innerHTML = shoreStones.map((stone, idx) => {
            const alreadySaved = box.stones.some(s => s.id === stone.id);
            const active = box.equipped.id === stone.id;
            return `<article class="stone-card rarity-${stone.rarity} ${active ? 'equipped' : ''}">
              <div class="stone-card-top">
                ${silhouetteSvg(stone)}
                <div class="stone-card-meta">
                  <div class="stone-name-row">
                    <strong>${stone.name}</strong>
                    <span class="rarity-tag rarity-${stone.rarity}">${stone.rarityLabel}</span>
                  </div>
                  <div class="stone-dims">${formatStoneDimensions(stone)}</div>
                </div>
              </div>
              <p class="stone-feel">${stone.feel}</p>
              <div class="stone-card-actions">
                <button type="button" data-try="${idx}">顺手试投</button>
                <button type="button" class="collect-btn" data-collect="${idx}" ${alreadySaved ? 'disabled' : ''}>${alreadySaved ? '已收入' : '收入石匣'}</button>
              </div>
            </article>`;
        }).join('');

        const boxGrid = backdrop.querySelector('#collection-grid')!;
        boxGrid.innerHTML = box.stones.map((stone, idx) => {
            const active = box.equipped.id === stone.id;
            const bestText = stone.bestSkips ? `最高 ${stone.bestSkips} 跳 · ${(stone.bestDistance ?? 0).toFixed(1)} m` : '尚未试投';
            return `<article class="stone-card rarity-${stone.rarity} ${active ? 'equipped' : ''}">
              <div class="stone-card-top">
                ${silhouetteSvg(stone)}
                <div class="stone-card-meta">
                  <div class="stone-name-row">
                    <kbd class="slot-key">${idx + 1}</kbd>
                    <strong>${stone.name}</strong>
                    <span class="rarity-tag rarity-${stone.rarity}">${stone.rarityLabel}</span>
                  </div>
                  <div class="stone-dims">${formatStoneDimensions(stone)}</div>
                  <div class="stone-best">${bestText}</div>
                </div>
              </div>
              <div class="stone-card-actions">
                <button type="button" class="${active ? 'active-equip' : ''}" data-equip="${stone.id}">${active ? '✓ 手中握持' : '拿在手里'}</button>
                ${box.stones.length > 1 ? `<button type="button" class="drop-btn" data-remove="${stone.id}">放回岸边</button>` : ''}
              </div>
            </article>`;
        }).join('');

        for (const btn of Array.from(shoreGrid.querySelectorAll<HTMLButtonElement>('[data-try]'))) {
            btn.onclick = () => {
                const stone = shoreStones[Number(btn.dataset.try)];
                if (!stone) return;
                box.equipEphemeral(stone);
                callbacks.onEquip(box.equipped);
                close();
            };
        }
        for (const btn of Array.from(shoreGrid.querySelectorAll<HTMLButtonElement>('[data-collect]'))) {
            btn.onclick = () => {
                const stone = shoreStones[Number(btn.dataset.collect)];
                if (!stone) return;
                const res = box.collect(stone);
                if (!res.ok) {
                    setFeedback(res.reason ?? '无法收藏');
                    return;
                }
                setFeedback(`已将「${stone.name}」收入随身石匣`);
                callbacks.onEquip(box.equipped);
                render();
            };
        }
        for (const btn of Array.from(boxGrid.querySelectorAll<HTMLButtonElement>('[data-equip]'))) {
            btn.onclick = () => {
                const id = btn.dataset.equip!;
                if (box.equipSaved(id)) {
                    callbacks.onEquip(box.equipped);
                    close();
                }
            };
        }
        for (const btn of Array.from(boxGrid.querySelectorAll<HTMLButtonElement>('[data-remove]'))) {
            btn.onclick = () => {
                const id = btn.dataset.remove!;
                if (box.remove(id)) {
                    setFeedback('已放回岸边');
                    callbacks.onEquip(box.equipped);
                    render();
                }
            };
        }
    }

    function open() {
        setFeedback('');
        render();
        backdrop.classList.add('open');
    }

    function close() {
        backdrop.classList.remove('open');
    }

    backdrop.querySelector<HTMLButtonElement>('#stone-modal-close')!.onclick = close;
    backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close();
    });
    backdrop.querySelector<HTMLButtonElement>('#reforage-btn')!.onclick = () => {
        shoreStones = forageShoreStones(box.careerSkips);
        setFeedback('沿岸新捡了 5 块天然石头');
        render();
    };

    return {
        open,
        close,
        isOpen: () => backdrop.classList.contains('open'),
        refresh: render,
        consumeEphemeralAfterThrow() {
            if (!box.ephemeral) return;
            // Remove the thrown ephemeral stone from current shore pile so it feels genuinely thrown
            const thrownId = box.ephemeral.id;
            shoreStones = shoreStones.filter(s => s.id !== thrownId);
            if (shoreStones.length < 3) {
                shoreStones = forageShoreStones(box.careerSkips);
            }
        },
    };
}
