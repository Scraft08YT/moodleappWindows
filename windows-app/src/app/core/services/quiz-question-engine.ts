/**
 * Quiz Question Engine — attaches interactivity to Moodle question HTML
 * after it is injected via [innerHTML].
 *
 * Handles:
 *  - ddwtos   (drag words onto sentences)
 *  - ddimageortext (drag images/text onto a background image)
 *  - ddmarker (drag markers onto a background image)
 *  - gapselect (inline select dropdowns — no special handling needed)
 *
 * The engine uses a "tap-to-select, tap-to-drop" interaction model
 * identical to the official Moodle Mobile App.
 *
 * Adapted from Moodle Mobile App source (Apache 2.0).
 */
import { Injectable } from '@angular/core';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DdwtosState {
    type: 'ddwtos';
    container: HTMLElement;
    readOnly: boolean;
    selected: HTMLElement | null;
    placed: Record<number, number>;
    inputIds: string[];
    nextDragNo: number;
    resizeCleanup: (() => void) | null;
}

interface DdImageState {
    type: 'ddimageortext';
    container: HTMLElement;
    readOnly: boolean;
    selected: HTMLElement | null;
    proportion: number;
    drops: DdImageDrop[];
    resizeCleanup: (() => void) | null;
}

interface DdImageDrop {
    group: number;
    text: string;
    xy: string;
    fieldname: string;
}

interface DdMarkerState {
    type: 'ddmarker';
    container: HTMLElement;
    readOnly: boolean;
    selected: HTMLElement | null;
    proportion: number;
    dropZones: DdMarkerDropZone[];
    svgEl: SVGSVGElement | null;
    shapes: SVGElement[];
    nextColourIdx: number;
    resizeCleanup: (() => void) | null;
}

interface DdMarkerDropZone {
    markertext: string;
    shape: string;
    coords: string;
}

type QuestionState = DdwtosState | DdImageState | DdMarkerState;

const COLOURS = ['#FFFFFF', '#B0C4DE', '#DCDCDC', '#D8BFD8', '#87CEFA', '#DAA520', '#FFD700', '#F0E68C'];

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class QuizQuestionEngine {

    private activeStates: QuestionState[] = [];

    /**
     * Scan a container for Moodle question HTML and attach interactivity.
     * Call this after setting [innerHTML] on a container element.
     *
     * @param root   The root HTMLElement containing question HTML.
     * @param readOnly  Whether the questions are in review mode (no interaction).
     */
    async initQuestions(root: HTMLElement, readOnly: boolean): Promise<void> {
        // ── ddwtos ──
        const ddwtosContainers = root.querySelectorAll<HTMLElement>('.que.ddwtos');
        for (const container of Array.from(ddwtosContainers)) {
            await this.initDdwtos(container, readOnly);
        }

        // ── ddimageortext ──
        const ddimgContainers = root.querySelectorAll<HTMLElement>('.que.ddimageortext');
        for (const container of Array.from(ddimgContainers)) {
            await this.initDdImageOrText(container, readOnly);
        }

        // ── ddmarker ──
        const ddmarkerContainers = root.querySelectorAll<HTMLElement>('.que.ddmarker');
        for (const container of Array.from(ddmarkerContainers)) {
            await this.initDdMarker(container, readOnly);
        }
    }

    /** Destroy all active question states and remove event listeners. */
    destroy(): void {
        for (const state of this.activeStates) {
            state.resizeCleanup?.();
        }
        this.activeStates = [];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // DD WTOS (Drag Words onto Sentences)
    // ═════════════════════════════════════════════════════════════════════════

    private async initDdwtos(container: HTMLElement, readOnly: boolean): Promise<void> {
        const state: DdwtosState = {
            type: 'ddwtos',
            container,
            readOnly,
            selected: null,
            placed: {},
            inputIds: [],
            nextDragNo: 1,
            resizeCleanup: null,
        };
        this.activeStates.push(state);

        container.classList.add(readOnly ? 'readonly' : 'notreadonly');

        // Collect hidden inputs (these store the answers).
        const inputs = Array.from(
            container.querySelectorAll<HTMLInputElement>('input[type="hidden"]:not([name*=sequencecheck])'),
        );
        state.inputIds = inputs.map(i => i.id);

        // Ensure a drag container exists.
        let dragContainer = container.querySelector<HTMLElement>('.drags');
        if (!dragContainer) {
            dragContainer = document.createElement('div');
            dragContainer.className = 'drags';
            const answerContainer = container.querySelector('.answercontainer');
            answerContainer?.appendChild(dragContainer);
        }

        // Wait a tick for layout.
        await this.nextFrame();

        // Set uniform sizes for each group.
        this.ddwtosPadGroups(state);

        // Clone drag homes into actual draggables.
        const dragHomes = Array.from(container.querySelectorAll<HTMLElement>('span.draghome'));
        for (const home of dragHomes) {
            this.ddwtosCloneDragItems(state, home, dragContainer);
        }

        // Place items from existing input values.
        this.ddwtosInitialPlace(state);

        // Create drop zones.
        if (!readOnly) {
            this.ddwtosMakeDropZones(state);
        }

        // Position all drags.
        this.ddwtosPositionAll(state);

        // Resize handler.
        const onResize = () => this.ddwtosPositionAll(state);
        window.addEventListener('resize', onResize);
        state.resizeCleanup = () => window.removeEventListener('resize', onResize);
    }

    private ddwtosCloneDragItems(state: DdwtosState, home: HTMLElement, dragContainer: HTMLElement): void {
        const isInfinite = home.classList.contains('infinite');
        const groupNo = this.getClassNum(home, 'group') ?? 0;
        const count = isInfinite
            ? state.container.querySelectorAll(`span.drop.group${groupNo}`).length
            : 1;

        for (let i = 0; i < count; i++) {
            const drag = home.cloneNode(true) as HTMLElement;
            drag.classList.remove('draghome');
            drag.classList.add('drag', `no${state.nextDragNo}`);
            state.nextDragNo++;
            drag.setAttribute('tabindex', '0');
            drag.style.visibility = 'visible';
            drag.style.position = 'absolute';
            dragContainer.appendChild(drag);

            if (!state.readOnly) {
                drag.addEventListener('click', () => {
                    if (drag.classList.contains('selected')) {
                        this.ddwtosDeselect(state);
                    } else {
                        this.ddwtosSelect(state, drag);
                    }
                });
            }
        }
    }

    private ddwtosInitialPlace(state: DdwtosState): void {
        const drags = Array.from(state.container.querySelectorAll<HTMLElement>('.drags span.drag'));
        drags.forEach(d => d.classList.add('unplaced'));
        state.placed = {};

        for (let placeNo = 0; placeNo < state.inputIds.length; placeNo++) {
            const input = state.container.querySelector<HTMLInputElement>(`#${state.inputIds[placeNo]}`);
            const choiceNo = Number(input?.value);
            if (!choiceNo || isNaN(choiceNo)) continue;

            const drop = state.container.querySelector<HTMLElement>(`span.drop.place${placeNo + 1}`);
            const groupNo = this.getClassNum(drop, 'group') ?? 0;
            const drag = state.container.querySelector<HTMLElement>(
                `.drags span.drag.unplaced.group${groupNo}.choice${choiceNo}`,
            );

            this.ddwtosPlaceDrag(state, drag, drop);
        }
    }

    private ddwtosPlaceDrag(state: DdwtosState, drag: HTMLElement | null, drop: HTMLElement | null): void {
        if (!drop) return;
        const placeNo = this.getClassNum(drop, 'place') ?? 0;
        const inputId = state.inputIds[placeNo - 1];
        const input = state.container.querySelector<HTMLInputElement>(`#${inputId}`);

        if (drag) {
            input?.setAttribute('value', String(this.getClassNum(drag, 'choice') ?? 0));
        } else {
            input?.setAttribute('value', '0');
        }

        // Remove previous placement.
        for (const key in state.placed) {
            if (state.placed[key] === placeNo) delete state.placed[key];
        }

        if (drag) {
            const no = this.getClassNum(drag, 'no') ?? 0;
            state.placed[no] = placeNo;
            drag.classList.remove('unplaced');
        }
    }

    private ddwtosMakeDropZones(state: DdwtosState): void {
        const drops = Array.from(state.container.querySelectorAll<HTMLElement>('span.drop'));
        drops.forEach(drop => {
            drop.addEventListener('click', () => {
                const drag = state.selected;
                if (!drag) return;
                if (this.getClassNum(drag, 'group') === this.getClassNum(drop, 'group')) {
                    this.ddwtosPlaceDrag(state, drag, drop);
                    this.ddwtosDeselect(state);
                    this.ddwtosPositionDrag(state, drag);
                }
            });
        });

        // Click on home area to return drag.
        const home = state.container.querySelector<HTMLElement>('.answercontainer');
        home?.addEventListener('click', () => {
            const drag = state.selected;
            if (!drag) return;
            if (drag.classList.contains('unplaced')) {
                this.ddwtosDeselect(state);
                return;
            }
            this.ddwtosRemoveDrag(state, drag);
            this.ddwtosDeselect(state);
            this.ddwtosPositionDrag(state, drag);
        });
    }

    private ddwtosPositionAll(state: DdwtosState): void {
        const drags = Array.from(state.container.querySelectorAll<HTMLElement>('.drags span.drag'));
        drags.forEach(drag => this.ddwtosPositionDrag(state, drag));
    }

    private ddwtosPositionDrag(state: DdwtosState, drag: HTMLElement): void {
        const no = this.getClassNum(drag, 'no') ?? 0;
        const placeNo = state.placed[no];
        const parent = state.container.querySelector<HTMLElement>('.qtext') ?? state.container;

        if (!placeNo) {
            // Return to home.
            const groupNo = this.getClassNum(drag, 'group') ?? 0;
            const choiceNo = this.getClassNum(drag, 'choice') ?? 0;
            const home = state.container.querySelector<HTMLElement>(
                `.draggrouphomes${groupNo} span.draghome.choice${choiceNo}, ` +
                `.answercontainer span.draghome.group${groupNo}.choice${choiceNo}`,
            );
            if (home) {
                const pos = this.relPos(home, parent);
                drag.style.left = `${pos.x}px`;
                drag.style.top = `${pos.y}px`;
            }
            drag.classList.add('unplaced');
        } else {
            const dropZone = state.container.querySelector<HTMLElement>(`span.drop.place${placeNo}`);
            if (dropZone) {
                const pos = this.relPos(dropZone, parent);
                drag.style.left = `${pos.x + 1}px`;
                drag.style.top = `${pos.y + 1}px`;
            }
            drag.classList.remove('unplaced');
        }
    }

    private ddwtosRemoveDrag(state: DdwtosState, drag: HTMLElement): void {
        const no = this.getClassNum(drag, 'no') ?? 0;
        const placeNo = state.placed[no];
        const drop = state.container.querySelector<HTMLElement>(`span.drop.place${placeNo}`);
        this.ddwtosPlaceDrag(state, null, drop);
    }

    private ddwtosSelect(state: DdwtosState, drag: HTMLElement): void {
        this.ddwtosDeselect(state);
        state.selected = drag;
        drag.classList.add('selected');
    }

    private ddwtosDeselect(state: DdwtosState): void {
        const drags = Array.from(state.container.querySelectorAll<HTMLElement>('.drags span.drag'));
        drags.forEach(d => d.classList.remove('selected'));
        state.selected = null;
    }

    private ddwtosPadGroups(state: DdwtosState): void {
        for (let g = 1; g <= 8; g++) {
            const items = Array.from(
                state.container.querySelectorAll<HTMLElement>(`.draggrouphomes${g} span.draghome, .answercontainer span.draghome.group${g}`),
            );
            if (!items.length) continue;

            let maxW = 0, maxH = 0;
            items.forEach(i => {
                maxW = Math.max(maxW, Math.ceil(i.offsetWidth));
                maxH = Math.max(maxH, Math.ceil(i.offsetHeight));
            });
            maxW += 8;
            maxH += 5;
            items.forEach(i => { i.style.width = `${maxW}px`; i.style.height = `${maxH}px`; });

            const drops = Array.from(state.container.querySelectorAll<HTMLElement>(`span.drop.group${g}`));
            drops.forEach(d => { d.style.width = `${maxW + 2}px`; d.style.height = `${maxH + 2}px`; });
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // DD IMAGE OR TEXT
    // ═════════════════════════════════════════════════════════════════════════

    private async initDdImageOrText(container: HTMLElement, readOnly: boolean): Promise<void> {
        const state: DdImageState = {
            type: 'ddimageortext',
            container,
            readOnly,
            selected: null,
            proportion: 1,
            drops: [],
            resizeCleanup: null,
        };
        this.activeStates.push(state);

        if (readOnly) container.classList.add('readonly');

        // Parse drop zone data from inline script or data attributes.
        state.drops = this.ddImageParseDrops(container);

        // Wait for background image to load.
        const bgImg = container.querySelector<HTMLImageElement>('.dropbackground');
        if (bgImg && (!bgImg.complete || !bgImg.naturalWidth)) {
            await new Promise<void>(resolve => {
                bgImg.addEventListener('load', () => resolve(), { once: true });
                // Safety timeout.
                setTimeout(resolve, 5000);
            });
        }

        await this.nextFrame();

        // Set up document structure.
        const ddArea = container.querySelector<HTMLElement>('.ddarea');
        if (!ddArea) return;

        // Ensure dropzones container exists.
        let dropZonesDiv = ddArea.querySelector<HTMLElement>('.dropzones');
        if (!dropZonesDiv) {
            dropZonesDiv = document.createElement('div');
            dropZonesDiv.className = 'dropzones';
            ddArea.appendChild(dropZonesDiv);
        }

        // Handle both old (.dragitems) and new (.draghomes) structure.
        let dragItemsArea = ddArea.querySelector<HTMLElement>('.dragitems') ?? ddArea.querySelector<HTMLElement>('.draghomes');
        if (!dragItemsArea) return;

        // If it's .draghomes, restructure to match expected DOM.
        if (dragItemsArea.classList.contains('draghomes')) {
            const oldDragItems = ddArea.querySelector('.dragitems');
            oldDragItems?.remove();
            ddArea.appendChild(dragItemsArea);
            dragItemsArea.classList.remove('draghomes');
            dragItemsArea.classList.add('dragitems');
            // Add dragitemhomes class to drag homes.
            Array.from(dragItemsArea.querySelectorAll('.draghome')).forEach((el, idx) => {
                el.classList.add(`dragitemhomes${idx}`);
            });
        }
        dragItemsArea.classList.add('clearfix');

        // Calculate proportion.
        this.ddImageCalcProportion(state);

        // Create drop zone elements.
        this.ddImageInitDrops(state, dropZonesDiv);

        // Clone drag items.
        const dragItemHomes = Array.from(dragItemsArea.querySelectorAll<HTMLElement>('.draghome'));
        let instanceNo = 0;
        for (const home of dragItemHomes) {
            const dragItemNo = this.getClassNum(home, 'dragitemhomes') ?? 0;
            const choice = this.getClassNum(home, 'choice') ?? 0;
            const group = this.getClassNum(home, 'group') ?? 0;

            // Wrap images in divs.
            if (home.tagName === 'IMG') {
                const wrap = document.createElement('div');
                wrap.className = home.className;
                home.className = '';
                home.parentNode?.insertBefore(wrap, home);
                wrap.appendChild(home);
            }

            const dragNode = this.ddImageCloneDrag(dragItemsArea, instanceNo, dragItemNo);
            instanceNo++;
            if (dragNode) {
                this.ddImageMakeDraggable(state, dragNode, group, choice);

                if (dragNode.classList.contains('infinite')) {
                    const groupDrops = dropZonesDiv.querySelectorAll(`.group${group}`);
                    let extra = groupDrops.length - 1;
                    while (extra > 0) {
                        const extraNode = this.ddImageCloneDrag(dragItemsArea, instanceNo, dragItemNo);
                        instanceNo++;
                        if (extraNode) this.ddImageMakeDraggable(state, extraNode, group, choice);
                        extra--;
                    }
                }
            }
        }

        // Make drag area clickable for returning items.
        if (!readOnly) {
            dragItemsArea.addEventListener('click', (e) => {
                if (!state.selected) return;
                this.ddImageDeselect(state);
                this.ddImageRemoveDrag(state, state.selected);
                e.preventDefault();
                e.stopPropagation();
            });
        }

        // Initial positioning — places items based on input values.
        this.ddImageRepositionAll(state);

        // Set tabindex on drop zones for keyboard navigation.
        if (!readOnly) {
            dropZonesDiv.querySelectorAll<HTMLElement>('.dropzone').forEach(dz => dz.setAttribute('tabindex', '0'));
        }

        // Resize handler.
        const onResize = () => this.ddImageRepositionAll(state);
        window.addEventListener('resize', onResize);
        state.resizeCleanup = () => window.removeEventListener('resize', onResize);
    }

    private ddImageParseDrops(container: HTMLElement): DdImageDrop[] {
        // Moodle sends drop zone data in a script tag or in the init object.
        // In the WS API response, the data is in the question's HTML as hidden inputs
        // and the drop zone positions are in the dropzones div with data attributes.
        const drops: DdImageDrop[] = [];
        const dropZoneEls = container.querySelectorAll<HTMLElement>('.ddarea .dropzones .dropzone, .ddarea [data-xy]');
        dropZoneEls.forEach(el => {
            drops.push({
                group: Number(el.getAttribute('group') ?? this.getClassNum(el, 'group') ?? 1),
                text: el.getAttribute('title') ?? el.getAttribute('aria-label') ?? '',
                xy: el.getAttribute('xy') ?? el.getAttribute('data-xy') ?? '0,0',
                fieldname: el.getAttribute('inputid') ?? '',
            });
        });
        return drops;
    }

    private ddImageCalcProportion(state: DdImageState): void {
        const bgImg = state.container.querySelector<HTMLImageElement>('.dropbackground');
        if (!bgImg) return;
        state.proportion = bgImg.width !== bgImg.naturalWidth ? bgImg.width / bgImg.naturalWidth : 1;
    }

    private ddImageInitDrops(state: DdImageState, dropZonesDiv: HTMLElement): void {
        // If drops already exist as DOM elements with positions, skip creation.
        if (dropZonesDiv.children.length > 0) return;

        const groupNodes: Record<number, HTMLElement> = {};
        for (let g = 1; g <= 8; g++) {
            const node = document.createElement('div');
            node.className = `dropzonegroup${g}`;
            dropZonesDiv.appendChild(node);
            groupNodes[g] = node;
        }

        state.drops.forEach((drop, idx) => {
            const dropNode = document.createElement('div');
            dropNode.className = `dropzone group${drop.group} place${idx}`;
            dropNode.setAttribute('title', drop.text);
            dropNode.setAttribute('xy', drop.xy);
            dropNode.setAttribute('aria-label', drop.text);
            dropNode.setAttribute('place', String(idx));
            dropNode.setAttribute('inputid', drop.fieldname.replace(':', '_'));
            dropNode.setAttribute('group', String(drop.group));
            dropNode.style.opacity = '0.5';

            if (!state.readOnly) {
                dropNode.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.ddImageDropClick(state, dropNode);
                });
            }

            groupNodes[drop.group]?.appendChild(dropNode);
        });
    }

    private ddImageCloneDrag(
        dragItemsArea: HTMLElement, instanceNo: number, dragItemNo: number,
    ): HTMLElement | null {
        const home = dragItemsArea.querySelector<HTMLElement>(`.dragitemhomes${dragItemNo}`);
        if (!home) return null;

        const homeImg = home.querySelector('img');
        let divDrag: HTMLElement;

        if (homeImg) {
            const img = homeImg.cloneNode(true) as HTMLElement;
            divDrag = document.createElement('div');
            divDrag.appendChild(img);
            divDrag.className = home.className;
            img.className = '';
        } else {
            divDrag = home.cloneNode(true) as HTMLElement;
        }

        divDrag.classList.remove(`dragitemhomes${dragItemNo}`, 'draghome');
        divDrag.classList.add(`dragitems${dragItemNo}`, `draginstance${instanceNo}`, 'drag');
        divDrag.style.visibility = 'inherit';
        divDrag.style.position = 'absolute';
        divDrag.setAttribute('draginstanceno', String(instanceNo));
        divDrag.setAttribute('dragitemno', String(dragItemNo));
        divDrag.setAttribute('tabindex', '0');

        home.parentElement?.insertBefore(divDrag, home.nextSibling);
        return divDrag;
    }

    private ddImageMakeDraggable(
        state: DdImageState, drag: HTMLElement, group: number, choice: number,
    ): void {
        drag.setAttribute('group', String(group));
        drag.setAttribute('choice', String(choice));

        if (!state.readOnly) {
            drag.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (drag.classList.contains('beingdragged')) {
                    this.ddImageDeselect(state);
                } else {
                    this.ddImageSelect(state, drag);
                }
            });
        }
    }

    private ddImageDropClick(state: DdImageState, dropNode: HTMLElement): void {
        const drag = state.selected;
        if (!drag) return;
        this.ddImageDeselect(state);
        if (Number(dropNode.getAttribute('group')) === Number(drag.getAttribute('group'))) {
            this.ddImagePlaceDrag(state, drag, dropNode);
        }
    }

    private ddImagePlaceDrag(state: DdImageState, drag: HTMLElement, drop: HTMLElement): void {
        const targetInputId = drop.getAttribute('inputid') ?? '';
        const input = state.container.querySelector<HTMLInputElement>(`input#${targetInputId}`);
        const originInputId = drag.getAttribute('inputid');

        if (originInputId && originInputId !== targetInputId) {
            const originInput = state.container.querySelector<HTMLInputElement>(`input#${originInputId}`);
            originInput?.setAttribute('value', '0');
        }

        const ddArea = state.container.querySelector<HTMLElement>('.ddarea');
        if (!ddArea) return;

        const pos = this.relPos(drop, ddArea);
        drag.style.left = `${pos.x}px`;
        drag.style.top = `${pos.y}px`;
        drag.classList.add('placed');

        const choice = drag.getAttribute('choice');
        if (choice) input?.setAttribute('value', choice);
        drag.setAttribute('inputid', targetInputId);
    }

    private ddImageRemoveDrag(state: DdImageState, drag: HTMLElement): void {
        const inputId = drag.getAttribute('inputid');
        if (inputId) {
            state.container.querySelector<HTMLInputElement>(`input#${inputId}`)?.setAttribute('value', '0');
        }

        const dragItemNo = Number(drag.getAttribute('dragitemno'));
        const dragItemsArea = state.container.querySelector<HTMLElement>('.dragitems');
        const home = dragItemsArea?.querySelector<HTMLElement>(`.dragitemhomes${dragItemNo}`);
        const ddArea = state.container.querySelector<HTMLElement>('.ddarea');
        if (!home || !ddArea) return;

        const pos = this.relPos(home, ddArea);
        drag.style.left = `${pos.x}px`;
        drag.style.top = `${pos.y}px`;
        drag.classList.remove('placed');
        drag.setAttribute('inputid', '');
    }

    private ddImageRepositionAll(state: DdImageState): void {
        const dragItemsArea = state.container.querySelector<HTMLElement>('.dragitems');
        if (!dragItemsArea) return;

        const dragItems = Array.from(dragItemsArea.querySelectorAll<HTMLElement>('.drag'));
        dragItems.forEach(d => {
            d.classList.remove('placed');
            d.setAttribute('inputid', '');
        });

        this.ddImageCalcProportion(state);

        // Reposition drop zones.
        const dropZones = Array.from(state.container.querySelectorAll<HTMLElement>('.dropzones .dropzone'));
        const ddArea = state.container.querySelector<HTMLElement>('.ddarea');
        const bgImg = state.container.querySelector<HTMLImageElement>('.dropbackground');

        for (const dz of dropZones) {
            const xyStr = dz.getAttribute('xy');
            if (xyStr) {
                const [x, y] = xyStr.split(',').map(Number);
                const relX = x * state.proportion;
                const relY = y * state.proportion;

                if (bgImg && ddArea) {
                    const bgPos = this.relPos(bgImg, ddArea);
                    dz.style.left = `${relX + bgPos.x + 1}px`;
                    dz.style.top = `${relY + bgPos.y + 1}px`;
                }
            }

            // Re-place items from inputs.
            const inputId = dz.getAttribute('inputid');
            const input = inputId ? state.container.querySelector<HTMLInputElement>(`input#${inputId}`) : null;
            const choice = input ? Number(input.value) : 0;

            if (choice > 0) {
                const group = dz.getAttribute('group');
                const available = dragItemsArea.querySelector<HTMLElement>(
                    `.drag.group${group}.choice${choice}:not(.placed):not(.beingdragged)`,
                );
                if (available) {
                    this.ddImagePlaceDrag(state, available, dz);
                }
            }
        }

        // Return unplaced items to home.
        for (const di of dragItems) {
            if (!di.classList.contains('placed') && !di.classList.contains('beingdragged')) {
                this.ddImageRemoveDrag(state, di);
            }
        }
    }

    private ddImageSelect(state: DdImageState, drag: HTMLElement): void {
        this.ddImageDeselect(state);
        state.selected = drag;
        drag.classList.add('beingdragged');
    }

    private ddImageDeselect(state: DdImageState): void {
        const items = state.container.querySelectorAll<HTMLElement>('.drag');
        items.forEach(d => d.classList.remove('beingdragged'));
        state.selected = null;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // DD MARKER
    // ═════════════════════════════════════════════════════════════════════════

    private async initDdMarker(container: HTMLElement, readOnly: boolean): Promise<void> {
        const state: DdMarkerState = {
            type: 'ddmarker',
            container,
            readOnly,
            selected: null,
            proportion: 1,
            dropZones: [],
            svgEl: null,
            shapes: [],
            nextColourIdx: 0,
            resizeCleanup: null,
        };
        this.activeStates.push(state);

        // Wait for bg image.
        const bgImg = container.querySelector<HTMLImageElement>('.dropbackground');
        if (bgImg && (!bgImg.complete || !bgImg.naturalWidth)) {
            await new Promise<void>(resolve => {
                bgImg.addEventListener('load', () => resolve(), { once: true });
                setTimeout(resolve, 5000);
            });
        }

        await this.nextFrame();
        if (!bgImg) return;

        this.ddMarkerCalcProportion(state);

        // Parse drop zones from the page's script data.
        state.dropZones = this.ddMarkerParseDropZones(container);

        // Ensure drag items area exists.
        const dragItemsArea = container.querySelector<HTMLElement>('.draghomes, .dragitems');
        if (!dragItemsArea) return;

        // Clone drag items.
        const homes = Array.from(dragItemsArea.querySelectorAll<HTMLElement>('span.draghome, span.marker'));
        let itemNo = 0;
        for (const home of homes) {
            const choiceNo = this.getClassNum(home, 'choice') ?? 0;
            const noOfDrags = this.getClassNum(home, 'noofdrags') ?? 1;
            const isInfinite = home.classList.contains('infinite');

            for (let i = 0; i < (isInfinite ? noOfDrags : 1); i++) {
                const drag = home.cloneNode(true) as HTMLElement;
                drag.classList.remove('draghome', 'marker');
                drag.classList.add('dragitem', `item${itemNo}`, `choice${choiceNo}`);
                home.classList.add('dragplaceholder');
                home.parentElement?.insertBefore(drag, home.nextSibling);

                if (!readOnly) {
                    this.ddMarkerMakeDraggable(state, drag);
                }
                itemNo++;
            }
        }

        // Make background droppable.
        if (!readOnly) {
            this.ddMarkerMakeDroppable(state);
        }

        // Draw drop zones and position drags.
        this.ddMarkerRedraw(state);

        const onResize = () => this.ddMarkerRedraw(state);
        window.addEventListener('resize', onResize);
        state.resizeCleanup = () => window.removeEventListener('resize', onResize);
    }

    private ddMarkerParseDropZones(container: HTMLElement): DdMarkerDropZone[] {
        // Drop zone data comes as JSON in a script tag or as data attributes.
        // For the WS API, drop zones may already be rendered.
        const zones: DdMarkerDropZone[] = [];

        // Try parsing from script tags (Moodle injects drop zone data this way).
        const scripts = container.querySelectorAll('script');
        for (const script of Array.from(scripts)) {
            const match = script.textContent?.match(/dropZones\s*=\s*(\[[\s\S]*?\]);/);
            if (match) {
                try {
                    const parsed = JSON.parse(match[1]);
                    return parsed;
                } catch { /* ignore */ }
            }
        }

        // Fallback: parse from DOM elements.
        const dropZoneEls = container.querySelectorAll<HTMLElement>('.dropzone[data-coords]');
        dropZoneEls.forEach(el => {
            zones.push({
                markertext: el.getAttribute('data-markertext') ?? '',
                shape: el.getAttribute('data-shape') ?? 'circle',
                coords: el.getAttribute('data-coords') ?? '',
            });
        });

        return zones;
    }

    private ddMarkerCalcProportion(state: DdMarkerState): void {
        const bgImg = state.container.querySelector<HTMLImageElement>('.dropbackground');
        if (!bgImg) return;
        state.proportion = bgImg.width !== bgImg.naturalWidth ? bgImg.width / bgImg.naturalWidth : 1;
    }

    private ddMarkerMakeDraggable(state: DdMarkerState, drag: HTMLElement): void {
        drag.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (drag.classList.contains('beingdragged')) {
                this.ddMarkerDeselect(state);
            } else {
                this.ddMarkerSelect(state, drag);
            }
        });
    }

    private ddMarkerMakeDroppable(state: DdMarkerState): void {
        const bgImg = state.container.querySelector<HTMLImageElement>('.dropbackground');
        bgImg?.addEventListener('click', (e) => {
            const drag = state.selected;
            if (!drag) return;
            this.ddMarkerDeselect(state);
            this.ddMarkerDropAt(state, drag, [e.offsetX, e.offsetY]);
            e.preventDefault();
            e.stopPropagation();
        });

        const home = state.container.querySelector<HTMLElement>('.draghomes, .dragitems');
        home?.addEventListener('click', (e) => {
            const drag = state.selected;
            if (!drag) return;
            if (drag.classList.contains('unplaced')) {
                this.ddMarkerDeselect(state);
                return;
            }
            this.ddMarkerDeselect(state);
            this.ddMarkerDropAt(state, drag, null);
            e.preventDefault();
            e.stopPropagation();
        });
    }

    private ddMarkerDropAt(state: DdMarkerState, drag: HTMLElement, position: number[] | null): void {
        const choiceNo = this.getClassNum(drag, 'choice') ?? 0;

        if (position && state.proportion < 1) {
            position = [Math.round(position[0] / state.proportion), Math.round(position[1] / state.proportion)];
        }

        this.ddMarkerSaveCoords(state, choiceNo, drag, position);
        this.ddMarkerRedraw(state);
    }

    private ddMarkerSaveCoords(
        state: DdMarkerState, choiceNo: number, dropped: HTMLElement, position: number[] | null,
    ): void {
        const input = state.container.querySelector<HTMLInputElement>(`input.choice${choiceNo}`);
        if (!input) return;

        const dragItemsArea = state.container.querySelector<HTMLElement>('.draghomes, .dragitems');
        const allChoiceDrags = dragItemsArea
            ? Array.from(dragItemsArea.querySelectorAll<HTMLElement>(`.dragitem.choice${choiceNo}`))
            : [];

        const coords: string[] = [];
        const ddArea = state.container.querySelector<HTMLElement>('.ddarea');
        const bgImg = state.container.querySelector<HTMLImageElement>('.dropbackground');

        for (const d of allChoiceDrags) {
            if (d === dropped || d.classList.contains('beingdragged')) continue;
            if (!d.classList.contains('unplaced') && bgImg && ddArea) {
                const pos = this.relPos(d, ddArea);
                const bgPos = this.relPos(bgImg, ddArea);
                let x = pos.x - bgPos.x;
                let y = pos.y - bgPos.y;
                if (state.proportion < 1) {
                    x = Math.round(x / state.proportion);
                    y = Math.round(y / state.proportion);
                }
                coords.push(`${x},${y}`);
            }
        }

        if (position) {
            dropped.classList.remove('unplaced');
            coords.push(`${position[0]},${position[1]}`);
        } else {
            dropped.classList.add('unplaced');
        }

        input.setAttribute('value', coords.join(';'));
    }

    private ddMarkerRedraw(state: DdMarkerState): void {
        const dragItemsArea = state.container.querySelector<HTMLElement>('.draghomes, .dragitems');
        if (!dragItemsArea) return;

        const drags = Array.from(dragItemsArea.querySelectorAll<HTMLElement>('.dragitem'));
        drags.forEach(d => d.classList.add('unneeded', 'unplaced'));

        this.ddMarkerCalcProportion(state);

        const inputs = Array.from(state.container.querySelectorAll<HTMLInputElement>('input.choices, input[name*="choice"]'));
        const ddArea = state.container.querySelector<HTMLElement>('.ddarea');
        const bgImg = state.container.querySelector<HTMLImageElement>('.dropbackground');

        if (!ddArea || !bgImg) return;

        const bgPos = this.relPos(bgImg, ddArea);

        for (const input of inputs) {
            const choiceNo = this.getClassNum(input, 'choice') ?? 0;
            const value = input.value;
            if (!value) continue;

            const coordStrings = value.split(';').filter(Boolean);
            const homes = dragItemsArea.querySelectorAll<HTMLElement>(`.draghome.choice${choiceNo}, .marker.choice${choiceNo}`);
            const homeEl = homes[0];
            if (!homeEl) continue;

            let itemIdx = 0;
            for (const coordStr of coordStrings) {
                const [cx, cy] = coordStr.split(',').map(Number);
                if (isNaN(cx) || isNaN(cy)) continue;

                let dragItem = dragItemsArea.querySelector<HTMLElement>(
                    `.dragitem.choice${choiceNo}.item${itemIdx}:not(.beingdragged)`,
                );

                if (!dragItem || dragItem.classList.contains('beingdragged')) {
                    // Clone a new one.
                    dragItem = homeEl.cloneNode(true) as HTMLElement;
                    dragItem.classList.remove('draghome', 'marker', 'dragplaceholder');
                    dragItem.classList.add('dragitem', `item${itemIdx}`, `choice${choiceNo}`);
                    homeEl.parentElement?.insertBefore(dragItem, homeEl.nextSibling);
                    if (!state.readOnly) this.ddMarkerMakeDraggable(state, dragItem);
                } else {
                    dragItem.classList.remove('unneeded');
                }

                const px = cx * state.proportion + bgPos.x;
                const py = cy * state.proportion + bgPos.y;

                const style = getComputedStyle(dragItem);
                const ml = parseFloat(style.marginLeft) || 0;
                const mt = parseFloat(style.marginTop) || 0;

                dragItem.style.left = `${px - ml}px`;
                dragItem.style.top = `${py - mt}px`;
                dragItem.classList.remove('unplaced');
                dragItem.classList.add('placed');

                homeEl.classList.add('active');
                itemIdx++;
            }

            // If there are remaining unplaced drags, position them at home.
            const infinite = input.classList.contains('infinite');
            const noOfDrags = this.getClassNum(input, 'noofdrags') ?? 1;
            const displayedDrags = itemIdx + (state.selected && this.getClassNum(state.selected, 'choice') === choiceNo ? 1 : 0);
            if (infinite || displayedDrags < noOfDrags) {
                // Need at least one at home.
                const homePos = this.relPos(homeEl, ddArea);
                let homeDrag = dragItemsArea.querySelector<HTMLElement>(
                    `.dragitem.choice${choiceNo}.unplaced:not(.beingdragged)`,
                );
                if (!homeDrag) {
                    homeDrag = homeEl.cloneNode(true) as HTMLElement;
                    homeDrag.classList.remove('draghome', 'marker', 'dragplaceholder');
                    homeDrag.classList.add('dragitem', `item${itemIdx}`, `choice${choiceNo}`, 'unplaced');
                    homeEl.parentElement?.insertBefore(homeDrag, homeEl.nextSibling);
                    if (!state.readOnly) this.ddMarkerMakeDraggable(state, homeDrag);
                }
                homeDrag.classList.remove('unneeded');
                homeDrag.style.left = `${homePos.x}px`;
                homeDrag.style.top = `${homePos.y}px`;
            }
        }

        // Remove unneeded.
        drags.forEach(d => {
            if (d.classList.contains('unneeded') && !d.classList.contains('beingdragged')) d.remove();
        });

        // Draw SVG drop zone shapes.
        this.ddMarkerDrawDropZones(state);
    }

    private ddMarkerDrawDropZones(state: DdMarkerState): void {
        if (!state.dropZones.length) return;

        const ddArea = state.container.querySelector<HTMLElement>('.ddarea');
        const bgImg = state.container.querySelector<HTMLImageElement>('.dropbackground');
        let dropZonesDiv = state.container.querySelector<HTMLElement>('.ddarea .dropzones');

        if (!ddArea || !bgImg) return;

        if (!dropZonesDiv) {
            dropZonesDiv = document.createElement('div');
            dropZonesDiv.className = 'dropzones';
            ddArea.appendChild(dropZonesDiv);
        }

        const bgPos = this.relPos(bgImg, ddArea);
        dropZonesDiv.style.left = `${bgPos.x}px`;
        dropZonesDiv.style.top = `${bgPos.y}px`;
        dropZonesDiv.style.width = `${bgImg.width}px`;
        dropZonesDiv.style.height = `${bgImg.height}px`;

        // Marker texts container.
        let markerTexts = ddArea.querySelector<HTMLElement>('.markertexts');
        if (!markerTexts) {
            markerTexts = document.createElement('div');
            markerTexts.className = 'markertexts';
            ddArea.appendChild(markerTexts);
        }
        markerTexts.style.left = `${bgPos.x}px`;
        markerTexts.style.top = `${bgPos.y}px`;
        markerTexts.style.width = `${bgImg.width}px`;
        markerTexts.style.height = `${bgImg.height}px`;

        // Create or clear SVG.
        if (!state.svgEl) {
            state.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            dropZonesDiv.appendChild(state.svgEl);
        } else {
            while (state.svgEl.firstChild) state.svgEl.removeChild(state.svgEl.firstChild);
        }
        state.svgEl.style.width = `${bgImg.width}px`;
        state.svgEl.style.height = `${bgImg.height}px`;
        state.shapes = [];
        state.nextColourIdx = 0;

        for (let i = 0; i < state.dropZones.length; i++) {
            const dz = state.dropZones[i];
            const colour = COLOURS[state.nextColourIdx % COLOURS.length];
            state.nextColourIdx++;

            const shape = this.ddMarkerDrawShape(state, dz.shape, dz.coords, colour);
            if (shape) {
                state.shapes[i] = shape;
            }

            // Add marker text.
            if (dz.markertext) {
                let span = markerTexts.querySelector<HTMLElement>(`.markertext${i}`);
                if (!span) {
                    span = document.createElement('span');
                    span.className = `markertext markertext${i}`;
                    markerTexts.appendChild(span);
                }
                span.innerHTML = dz.markertext;
                span.style.opacity = '0.6';
                span.style.position = 'absolute';
            }
        }
    }

    private ddMarkerDrawShape(
        state: DdMarkerState, shape: string, coords: string, colour: string,
    ): SVGElement | null {
        if (!state.svgEl) return null;

        const p = state.proportion;

        if (shape === 'circle') {
            const match = coords.match(/^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?);(\d+(?:\.\d+)?)$/);
            if (!match) return null;
            const cx = Number(match[1]) * p;
            const cy = Number(match[2]) * p;
            const r = Number(match[3]) * p;
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            el.setAttribute('cx', String(cx));
            el.setAttribute('cy', String(cy));
            el.setAttribute('r', String(Math.round(r)));
            el.setAttribute('fill', colour);
            el.setAttribute('fill-opacity', '0.5');
            el.setAttribute('stroke', 'black');
            state.svgEl.appendChild(el);
            return el;
        }

        if (shape === 'rectangle') {
            const match = coords.match(/^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?);(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/);
            if (!match) return null;
            const x = Number(match[1]) * p;
            const y = Number(match[2]) * p;
            const w = Number(match[3]) * p;
            const h = Number(match[4]) * p;
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x', String(Math.round(x)));
            el.setAttribute('y', String(Math.round(y)));
            el.setAttribute('width', String(Math.round(w)));
            el.setAttribute('height', String(Math.round(h)));
            el.setAttribute('fill', colour);
            el.setAttribute('fill-opacity', '0.5');
            el.setAttribute('stroke', 'black');
            state.svgEl.appendChild(el);
            return el;
        }

        if (shape === 'polygon') {
            const bits = coords.split(';');
            const points = bits.map(b => {
                const [x, y] = b.split(',').map(Number);
                return `${Math.round(x * p)},${Math.round(y * p)}`;
            }).join(' ');
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            el.setAttribute('points', points);
            el.setAttribute('fill', colour);
            el.setAttribute('fill-opacity', '0.5');
            el.setAttribute('stroke', 'black');
            state.svgEl.appendChild(el);
            return el;
        }

        return null;
    }

    private ddMarkerSelect(state: DdMarkerState, drag: HTMLElement): void {
        this.ddMarkerDeselect(state);
        state.selected = drag;
        drag.classList.add('beingdragged');
    }

    private ddMarkerDeselect(state: DdMarkerState): void {
        const drags = state.container.querySelectorAll<HTMLElement>('.dragitem');
        drags.forEach(d => d.classList.remove('beingdragged'));
        state.selected = null;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Shared Utilities
    // ═════════════════════════════════════════════════════════════════════════

    /** Extract the numeric suffix from a class like "group3" → 3. */
    private getClassNum(el: HTMLElement | null, prefix: string): number | undefined {
        if (!el?.classList) return undefined;
        const re = new RegExp(`^${prefix}(\\d+)$`);
        for (const cls of Array.from(el.classList)) {
            const m = re.exec(cls);
            if (m) return Number(m[1]);
        }
        return undefined;
    }

    /** Get position of `child` relative to `parent`. */
    private relPos(child: HTMLElement, parent: HTMLElement): { x: number; y: number } {
        const cRect = child.getBoundingClientRect();
        const pRect = parent.getBoundingClientRect();
        return { x: cRect.left - pRect.left, y: cRect.top - pRect.top };
    }

    /** Wait for next animation frame. */
    private nextFrame(): Promise<void> {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
}
