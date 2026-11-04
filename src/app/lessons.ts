// The lessons of the Atlas, as data: what each step says (in English and Russian), which real element of the screen it
// lights up, the mouse move or keys it shows, and how the coach (Coach.tsx) tells that the GM has done what it asks.
// The elements are found by the classes the app already has and by `data-tour`, `data-tab`, `data-level` and
// `data-section` marks put on them for the lessons.
import type { LevelId } from "./levels/types";

export type Pair = [en: string, ru: string];
export type Gesture = "click" | "double" | "right" | "drag" | "wheel" | "hover";
export type Step = {
  title: Pair;
  text: Pair;
  /** The element lit up: the first match of this selector that is on screen. None: the card waits at the bottom. */
  target?: string;
  gesture?: Gesture;
  keys?: string[];
  /** The GM has done what the step asks: it moves on by itself (and is passed over when it is so already). */
  done?: () => boolean;
  /** A step that only gets the screen there (opens the level the lesson is about): passed over when it is so already. */
  pass?: boolean;
  /** Or: the step moves on when this reading of the screen changes (the map moved, another place was picked). */
  change?: () => string | undefined;
  /** Sets the screen up for the step; returning false tries again a moment later (the screen is still coming). */
  before?: () => boolean | void;
};
export type GroupId = "start" | "planet" | "towns" | "space" | "table";
export type Lesson = {
  id: string;
  icon: string;
  group: GroupId;
  title: Pair;
  about: Pair;
  /** The kinds of world (by top map) the lesson works in; any other borrows the demo world named here. */
  tops?: string[];
  demo?: string;
  steps: Step[];
};

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector);
const shown = (selector: string) => [...document.querySelectorAll(selector)].some((el) => el.getClientRects().length > 0);
const view = () => new URLSearchParams(location.search).get("view");
/** This level is on screen with its map. */
const at = (level: LevelId) => view() === level && shown(".stage .map");
const pressed = (selector: string) => $(selector)?.getAttribute("aria-pressed") === "true";
const checked = (selector: string) => !!$<HTMLInputElement>(selector)?.checked;
/** The name on the card of what is picked: it changes when another thing is picked. */
const picked = () => $(".inspector .card h3")?.textContent ?? "";
const canvas = () => $(".map-canvas")?.style.transform ?? "";
const zoom = () => /scale\(([^)]*)\)/u.exec(canvas())?.[1] ?? "";
/** Shows a level of the world, if its button is there (the world may still be loading). */
const show = (level: LevelId) => () => {
  const button = $(`[data-level="${level}"]`);
  if (!button) return false;
  if (button.getAttribute("aria-pressed") !== "true") button.click();
  return true;
};
/** Opens the GM's panel when it is folded away (not in the players' view). */
const gmOpen = () => {
  if (!shown(".app.players")) $<HTMLButtonElement>(".gm-min button")?.click();
};
const openDetails = (selector: string) => () => {
  const details = $<HTMLDetailsElement>(selector);
  if (details) details.open = true;
};

const PLANET = ["planet"];

export const GROUPS: { id: GroupId; title: Pair }[] = [
  { id: "start", title: ["First steps", "Первые шаги"] },
  { id: "planet", title: ["The planet and its maps", "Планета и её карты"] },
  { id: "towns", title: ["Cities, buildings, dungeons", "Города, здания, подземелья"] },
  { id: "space", title: ["Space", "Космос"] },
  { id: "table", title: ["At the table", "За игровым столом"] },
];

export const LESSONS: Lesson[] = [
  {
    id: "screen",
    icon: "🧭",
    group: "start",
    title: ["The screen", "Знакомство с экраном"],
    about: ["Where everything is: levels, panels, the map and the GM's layer.", "Где что находится: уровни, панели, карта и слой мастера."],
    steps: [
      {
        title: ["Welcome to the Atlas", "Добро пожаловать в Атлас"],
        text: [
          "The Atlas draws maps for your game, from a whole universe down to one room, and keeps them together as one world. What a lesson lights up is the real thing: you can press it right during the lesson.",
          "Атлас рисует карты для игры — от целой вселенной до одной комнаты — и хранит их вместе, одним миром. Подсвеченное в уроке — настоящие кнопки: ими можно пользоваться прямо во время урока.",
        ],
      },
      {
        target: ".views",
        keys: ["1 … 9"],
        title: ["The levels of your world", "Уровни мира"],
        text: [
          "Universe, galaxy, star system, planet, region, underworld, city, building, local map: each map opens the ones inside it. The keys 1–9 switch the levels.",
          "Вселенная, галактика, система, планета, регион, подземный мир, город, здание, местность: каждая карта открывает вложенные в неё. Клавиши 1–9 переключают уровни.",
        ],
      },
      {
        target: ".world-button",
        title: ["Your worlds", "Ваши миры"],
        text: ["The world's name opens the library: all your worlds, snapshots, files and demo worlds.", "Имя мира открывает библиотеку: все ваши миры, снимки, файлы и демо-миры."],
      },
      {
        target: ".seed",
        title: ["The seed is the map's code", "Сид — код карты"],
        text: [
          "The same seed with the same settings always grows the same map. 🎲 takes a new seed, «Create» grows the map anew.",
          "Один сид с теми же настройками всегда даёт ту же карту. 🎲 берёт новый сид, «Создать» выращивает карту заново.",
        ],
      },
      {
        target: ".crumbs",
        title: ["The path", "Путь"],
        text: [
          "The way from the world's top map to this one. A step takes you back to it; ▾ beside a step lists the maps next to it.",
          "Дорога от верхней карты мира до этой. Шаг пути возвращает на свою карту, а ▾ рядом с ним показывает соседние карты того же уровня.",
        ],
      },
      {
        target: "aside.controls",
        title: ["How the map is made", "Как карта создаётся"],
        text: [
          "On the left: the generator's settings, the age and the setting, the style, the layers and the level's editor. Sections fold away and stay as you left them.",
          "Слева — настройки генератора, эпоха и сеттинг, стиль, слои и редактор уровня. Разделы сворачиваются и остаются такими, как вы их оставили.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "drag",
        title: ["The map", "Карта"],
        text: ["Drag it, zoom it with the wheel, click places on it. Every move is in the lesson «Map: mouse and keys».", "Её можно двигать, приближать колесом, щёлкать по местам. Все приёмы — в уроке «Карта: мышь и клавиши»."],
      },
      {
        target: "aside.inspector",
        title: ["What is there", "Что там"],
        text: [
          "On the right: all about what you picked — a town, a realm, a cave, a room — and, in the tabs, lists of everything on the map.",
          "Справа — всё о выбранном: городе, державе, пещере, комнате, а во вкладках — списки всего, что есть на карте.",
        ],
      },
      {
        target: ".gm",
        title: ["The GM's layer", "Слой мастера"],
        text: ["Your pins, fog of war, names and notes over any map, and the players' view for a second screen.", "Ваши метки, туман войны, имена и заметки поверх любой карты и вид для игроков для второго экрана."],
      },
      {
        target: '[data-tour="lessons"]',
        title: ["Lessons are always here", "Уроки всегда здесь"],
        text: ["🎓 opens the lessons, ? the keys and mouse moves. Next comes the map itself.", "🎓 открывает уроки, ? — шпаргалку по клавишам и мыши. Дальше — сама карта."],
      },
    ],
  },
  {
    id: "map",
    icon: "🖱",
    group: "start",
    title: ["Map: mouse and keys", "Карта: мышь и клавиши"],
    about: ["Moving, zooming, looking, measuring and going inside.", "Двигать, приближать, рассматривать, мерить и заходить внутрь."],
    tops: PLANET,
    demo: "kingdoms",
    steps: [
      {
        before: show("planet"),
        target: ".stage .map",
        gesture: "drag",
        change: canvas,
        title: ["Move the map", "Подвиньте карту"],
        text: ["Press the mouse button and drag the map. On the globe the same move turns the planet.", "Зажмите кнопку мыши и перетащите карту. На глобусе тот же жест поворачивает планету."],
      },
      {
        target: ".stage .map",
        gesture: "wheel",
        change: zoom,
        title: ["Zoom in", "Приблизьте"],
        text: ["Turn the wheel over the map: it zooms around the cursor. On a touch screen, use two fingers.", "Покрутите колесо над картой: масштаб меняется вокруг курсора. На сенсорном экране — двумя пальцами."],
      },
      {
        target: ".map-tools",
        keys: ["+", "−", "0", "← ↑ → ↓"],
        title: ["The map's buttons", "Кнопки карты"],
        text: ["+ and − zoom, ⤢ shows the whole map, 📏 is the ruler. The keys do the same.", "+ и − меняют масштаб, ⤢ показывает карту целиком, 📏 — линейка. Клавиши делают то же самое."],
      },
      {
        target: ".stage .map",
        gesture: "hover",
        done: () => shown(".map-tip"),
        title: ["Point at a place", "Наведите курсор"],
        text: ["Hold the cursor over a town, a river or a sea: a hint names what is under it.", "Задержите курсор над городом, рекой или морем — подсказка назовёт, что под ним."],
      },
      {
        target: ".stage .map",
        gesture: "click",
        change: picked,
        title: ["Click a place", "Щёлкните по месту"],
        text: [
          "Click a town or any land: its card opens on the right — who lives there, whose land it is, which maps open from it.",
          "Щёлкните по городу или по суше — справа откроется карточка: кто там живёт, чья это земля, какие карты отсюда открываются.",
        ],
      },
      {
        target: '.map-tools [aria-pressed]',
        keys: ["R"],
        done: () => shown(".map.ruling"),
        title: ["The ruler", "Линейка"],
        text: ["Press 📏 or R.", "Нажмите 📏 или R."],
      },
      {
        target: ".stage .map",
        gesture: "click",
        keys: ["Esc"],
        done: () => shown(".map-ruler text"),
        title: ["Measure", "Измерьте"],
        text: [
          "Click two points: the line gives the distance (on a whole planet, along the great circle). Esc or R puts the ruler away.",
          "Щёлкните по двум точкам — линия покажет расстояние (на целой планете — по большому кругу). Esc или R убирают линейку.",
        ],
      },
      {
        target: ".stage .map",
        keys: ["M"],
        done: () => shown(".minimap"),
        title: ["The minimap", "Миникарта"],
        text: [
          "Zoom in close and press M: a small map in the corner shows where you are; a click on it takes you there.",
          "Приблизьте карту посильнее и нажмите M — в углу появится миникарта; щелчок по ней переносит туда.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "right",
        done: () => shown(".map-menu"),
        title: ["Right click", "Правый клик"],
        text: [
          "Right-click the map: the menu lists every map that opens at that point — the town, the region, a cave, a local map, a 200 km sheet.",
          "Щёлкните правой кнопкой: меню перечислит все карты, что открываются в этой точке, — город, регион, пещеру, местность, лист 200 км.",
        ],
      },
      {
        title: ["Gold dots", "Золотые точки"],
        text: [
          "Gold dots mark the places whose maps you have opened already. Every map keeps its own zoom and place while the Atlas is open.",
          "Золотые точки отмечают места, чьи карты вы уже открывали. Каждая карта помнит свой масштаб и место, пока Атлас открыт.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "double",
        done: () => !!view() && view() !== "planet",
        title: ["Double-click to go in", "Двойной клик — внутрь"],
        text: [
          "Double-click a town: its city map opens. The path at the top leads back to the planet.",
          "Дважды щёлкните по городу — откроется карта города. Назад, на планету, ведёт путь вверху.",
        ],
      },
    ],
  },
  {
    id: "navigation",
    icon: "🔀",
    group: "start",
    title: ["Levels, path and search", "Уровни, путь и поиск"],
    about: ["Going between maps and finding anything in the world.", "Как ходить между картами и найти что угодно в мире."],
    steps: [
      {
        target: ".views",
        keys: ["1 … 9"],
        change: () => view() ?? "",
        title: ["Switch the level", "Переключите уровень"],
        text: [
          "Press another level at the top, or its number. A level you have not reached yet says where it opens from.",
          "Нажмите другой уровень вверху или его цифру. Уровень, до которого вы ещё не дошли, подскажет, откуда он открывается.",
        ],
      },
      {
        target: ".crumbs",
        title: ["The way back", "Дорога назад"],
        text: [
          "The steps of the path lead to the maps you came through. ▾ beside a step lists the maps of the same level next to it: other towns of the planet, other floors.",
          "Шаги пути ведут на карты, через которые вы пришли. ▾ у шага — соседние карты того же уровня: другие города той же планеты, другие этажи.",
        ],
      },
      {
        title: ["Back and Forward", "«Назад» и «Вперёд»"],
        text: ["In a browser, its Back and Forward buttons walk the levels you went through.", "В браузере его кнопки «Назад» и «Вперёд» ходят по уровням, где вы были."],
      },
      {
        target: '[data-tour="search"]',
        keys: ["Ctrl+K", "/"],
        done: () => shown("dialog.search-box"),
        title: ["Search the world", "Поиск по миру"],
        text: ["Open the search: 🔍, Ctrl+K or /.", "Откройте поиск: 🔍, Ctrl+K или /."],
      },
      {
        before: () => {
          if (!shown("dialog.search-box")) $('[data-tour="search"]')?.click();
        },
        target: "dialog.search-box input",
        done: () => ($<HTMLInputElement>("dialog.search-box input")?.value.length ?? 0) > 1,
        title: ["Type a name", "Наберите имя"],
        text: [
          "It finds the names of places on every map you opened, your notes and the handbook's pages. A click on a find opens its map.",
          "Ищутся имена мест на всех открытых картах, ваши заметки и страницы справочника. Щелчок по находке открывает её карту.",
        ],
      },
      {
        keys: ["Esc"],
        pass: true,
        done: () => !shown("dialog.search-box"),
        title: ["Esc closes", "Esc закрывает"],
        text: ["Esc closes the search, and any window of the Atlas.", "Esc закрывает поиск — и любое окно Атласа."],
      },
    ],
  },
  {
    id: "worlds",
    icon: "📚",
    group: "start",
    title: ["Worlds and the library", "Миры и библиотека"],
    about: ["Creating worlds, snapshots, files, the trash and demo worlds.", "Новые миры, снимки, файлы, корзина и демо-миры."],
    steps: [
      {
        target: ".world-button",
        done: () => shown("dialog.library"),
        title: ["Open the library", "Откройте библиотеку"],
        text: ["Press the world's name.", "Нажмите на имя мира."],
      },
      {
        target: '[data-tour="library-current"]',
        title: ["This world", "Этот мир"],
        text: [
          "Its name, the age and setting of all its maps at once, saving it to an .atlas.json file and a copy of it. The tick below makes it a template for new worlds.",
          "Имя мира, эпоха и сеттинг сразу для всех его карт, сохранение в файл .atlas.json и копия мира. Галочка ниже делает мир шаблоном для новых.",
        ],
      },
      {
        target: '[data-tour="snapshot"]',
        title: ["Snapshots and branches", "Снимки и ветки"],
        text: [
          "📸 keeps the world as it is now. In the list of snapshots ↺ takes the world back to one, and ⑂ makes a snapshot a branch: a world of its own.",
          "📸 запоминает мир как есть. В списке снимков ↺ возвращает мир к снимку, а ⑂ делает из снимка ветку — отдельный мир.",
        ],
      },
      {
        target: '[data-tour="library-all"]',
        title: ["All your worlds", "Все миры"],
        text: [
          "A click opens a world. 💾 saves any world to a file; 🗑 puts it in the trash, from where it can come back.",
          "Щелчок открывает мир. 💾 сохраняет любой мир в файл, 🗑 убирает в корзину — оттуда его можно вернуть.",
        ],
      },
      {
        target: '[data-tour="library-load"]',
        title: ["Open a world file", "Файл мира"],
        text: [
          "Opens an .atlas.json. If it is a copy of a world you have here, the Atlas offers to pour its names, notes, pins and maps into yours.",
          "Открывает .atlas.json. Если это копия мира, который здесь уже есть, Атлас предложит влить в него имена, заметки, метки и карты из файла.",
        ],
      },
      {
        target: '[data-tour="library-new"]',
        title: ["A new world", "Новый мир"],
        text: [
          "Pick its top map — universe, galaxy, system, planet, city, building or local map — a seed, the age and the alphabet of names, and press «Create the world».",
          "Выберите верхнюю карту — вселенную, галактику, систему, планету, город, здание или местность, — сид, эпоху и алфавит имён и нажмите «Создать мир».",
        ],
      },
      {
        target: '[data-tour="packs"]',
        title: ["Your own content", "Свой контент"],
        text: [
          "Your own kinds of places, wards, buildings and rooms, themes and tables go into one pack file: to carry to another browser or the Windows app.",
          "Свои виды мест, кварталов, зданий и комнат, темы и таблицы сохраняются одним файлом-пакетом — чтобы перенести их в другой браузер или в программу.",
        ],
      },
      {
        target: '[data-tour="demos"]',
        title: ["Demo worlds", "Демо-миры"],
        text: [
          "Ready worlds of different ages to look around in: medieval kingdoms, a fallen world, a space opera, a neon city, a crypt, a universe.",
          "Готовые миры разных эпох, чтобы осмотреться: средневековые королевства, павший мир, космическая опера, неоновый город, склеп, вселенная.",
        ],
      },
      {
        keys: ["Esc"],
        pass: true,
        done: () => !shown("dialog.library"),
        title: ["Close the library", "Закройте библиотеку"],
        text: ["Esc or ✕.", "Esc или ✕."],
      },
      {
        target: ".save-state",
        title: ["Saved as you go", "Сохраняется само"],
        text: [
          "The world saves itself after every change; this shows that all is written. Worlds live in this browser (or in the Windows app), so keep the important ones in files too.",
          "Мир сохраняется сам после каждой правки — здесь видно, что всё записано. Миры живут в этом браузере (или в программе), поэтому важные стоит хранить и в файлах.",
        ],
      },
      {
        target: '[data-tour="undo"]',
        keys: ["Ctrl+Z", "Ctrl+Y"],
        title: ["Undo", "Отмена"],
        text: ["↶ and ↷ undo and redo the world's changes.", "↶ и ↷ отменяют и возвращают правки мира."],
      },
    ],
  },
  {
    id: "planet",
    icon: "🌍",
    group: "planet",
    title: ["Planet: growing a world", "Планета: как растёт мир"],
    about: ["The planet's settings, the generator, rerolls, relief recipes and the globe.", "Параметры планеты, генератор, переброс стадий, рецепт рельефа и глобус."],
    tops: PLANET,
    demo: "kingdoms",
    steps: [
      {
        before: show("planet"),
        target: '[data-tour="planet-form"]',
        title: ["The planet's settings", "Параметры планеты"],
        text: [
          "Everything about the world in one form: name and seed, age, how much of the planet the map covers (all of it, a hemisphere, a continent, a land), climate, peoples and realms, how deep its history goes. Nothing changes until «Create the planet».",
          "Всё о мире в одной форме: имя и сид, эпоха, сколько планеты на карте (вся, полушарие, материк, край), климат, народы и державы, глубина истории. Ничего не меняется, пока вы не нажмёте «Создать планету».",
        ],
      },
      {
        target: '[data-section="planet-generation"]',
        title: ["The generator's knobs", "Ручки генератора"],
        text: [
          "The style changes at once. The land template, detail and numbers wait for «Create»: when they no longer match the map, the panel says so.",
          "Стиль меняется сразу. Шаблон суши, детальность и числа ждут «Создать»: если настройки разошлись с картой, панель об этом напомнит.",
        ],
      },
      {
        target: '[data-tour="reroll"]',
        title: ["Reroll one stage", "Перебросить одну стадию"],
        text: [
          "Peoples, towns, realms, faiths, names or places can be rolled again one by one; everything else stays as it was.",
          "Народы, города, державы, веры, названия или места можно перебросить по отдельности — всё остальное останется как было.",
        ],
      },
      {
        target: "details.recipe",
        title: ["Relief recipe and land share", "Рецепт рельефа и доля суши"],
        text: [
          "Set how much of the planet is land, and write your own relief recipe: «Template's recipe» gives an example, «Create the world» grows it.",
          "Задайте долю суши и напишите свой рецепт рельефа: «Рецепт шаблона» даёт образец, «Создать мир» выращивает мир по нему.",
        ],
      },
      {
        target: ".seed",
        title: ["Share a world by its seed", "Мир по сиду"],
        text: [
          "Type a seed and press Enter: anyone with the same seed and settings gets the same planet.",
          "Введите сид и нажмите Enter: у любого с тем же сидом и настройками вырастет та же планета.",
        ],
      },
      {
        target: '[data-tour="globe"]',
        done: () => pressed('[data-tour="globe"] button:last-child'),
        title: ["The globe", "Глобус"],
        text: [
          "Press «Globe»: the planet turns under the mouse, and the sliders set the longitude and latitude in the middle.",
          "Нажмите «Глобус»: планету можно крутить мышью, а ползунки задают долготу и широту в центре.",
        ],
      },
      {
        target: '[data-tour="globe"]',
        done: () => pressed('[data-tour="globe"] button:first-child'),
        title: ["Back to the map", "Назад к карте"],
        text: ["Press «Map»: pins, fog and the editor work on the flat map.", "Нажмите «Карта»: метки, туман и редактор работают на плоской карте."],
      },
    ],
  },
  {
    id: "layers",
    icon: "🎨",
    group: "planet",
    title: ["Layers, styles and tables", "Слои, стили и таблицы"],
    about: ["What the map shows and how it looks.", "Что карта показывает и как выглядит."],
    tops: PLANET,
    demo: "kingdoms",
    steps: [
      {
        before: show("planet"),
        target: '[data-tour="presets"]',
        title: ["Ready views", "Готовые виды"],
        text: [
          "Political, physical, for the players, climate, clean: each button turns on its own set of layers at once.",
          "Политическая, физическая, для игроков, климат, чистая: каждая кнопка разом включает свой набор слоёв.",
        ],
      },
      {
        target: '[data-section="planet-view"]',
        title: ["Layers one by one", "Слои по одному"],
        text: [
          "Below are all the layers: biomes, heights, rivers, borders, roads, labels, arms, peoples, faiths, temperature, rain, currents, winds, armies, the grid… Turn on what your scene needs.",
          "Ниже — все слои: биомы, высоты, реки, границы, дороги, подписи, гербы, народы, религии, температура, осадки, течения, ветра, армии, сетка… Включайте то, что нужно сцене.",
        ],
      },
      {
        target: '[data-section="planet-generation"] select',
        title: ["The map's style", "Стиль карты"],
        text: [
          "Atlas, parchment, political, relief, night, road atlas, hologram, wasteland: the style changes at once, nothing is regrown.",
          "Атлас, пергамент, политическая, рельеф, ночь, современная карта, голограмма, пустошь — стиль меняется сразу, без пересоздания.",
        ],
      },
      {
        target: ".legend, .legend-toggle",
        title: ["The legend", "Легенда"],
        text: ["It explains every sign of this map; its parts fold away. Exported pictures carry it too.", "Объясняет каждый знак этой карты, разделы сворачиваются. Легенда попадает и в выгруженную картинку."],
      },
      {
        target: '[data-tour="tables"]',
        done: () => shown("dialog.tables"),
        title: ["Tables", "Таблицы"],
        text: ["The world in figures: realms, peoples, faiths and the largest towns, sorted by any column. Open them.", "Мир в числах: державы, народы, веры и крупнейшие города, с сортировкой по любому столбцу. Откройте их."],
      },
      {
        keys: ["Esc"],
        pass: true,
        done: () => !shown("dialog.tables"),
        title: ["Close the tables", "Закройте таблицы"],
        text: ["Esc or ✕.", "Esc или ✕."],
      },
    ],
  },
  {
    id: "inspector",
    icon: "🔎",
    group: "planet",
    title: ["Cards and lists", "Карточки и списки"],
    about: ["Everything about a place, and lists of everything on the map.", "Всё о месте и списки всего, что есть на карте."],
    tops: PLANET,
    demo: "kingdoms",
    steps: [
      {
        before: show("planet"),
        target: "aside.inspector nav.tabs",
        title: ["Tabs", "Вкладки"],
        text: [
          "«Place» is the card of what you picked; the others list realms, peoples, faiths, towns, rivers and landmarks. A world with a history also has its «Chronicle».",
          "«Место» — карточка выбранного; остальные вкладки — списки: государства, народы, религии, города, реки, достопримечательности. У мира с историей есть ещё «Летопись».",
        ],
      },
      {
        target: '[data-tab="burgs"]',
        done: () => pressed('[data-tab="burgs"]'),
        title: ["Open the towns", "Откройте города"],
        text: ["Press «Towns».", "Нажмите «Города»."],
      },
      {
        before: () => {
          if (!pressed('[data-tab="burgs"]')) $('[data-tab="burgs"]')?.click();
        },
        target: "aside.inspector input.search",
        change: picked,
        title: ["Find and pick", "Найдите и выберите"],
        text: [
          "The field filters the list. A click on a row picks the town and brings the map to it.",
          "Поле сверху отбирает строки. Щелчок по строке выбирает город и переносит к нему карту.",
        ],
      },
      {
        target: "aside.inspector .card",
        title: ["The card", "Карточка"],
        text: [
          "Underlined names are links: the realm, the province, the people, the faith. A town has its people, traits, story and «Open the city map»; a realm its arms, capital, armies, rulers and neighbours.",
          "Подчёркнутые имена — ссылки: держава, провинция, народ, вера. У города — жители, черты, история и «Открыть карту города»; у державы — герб, столица, армии, правители и соседи.",
        ],
      },
      {
        target: '[data-tab="states"]',
        done: () => pressed('[data-tab="states"]'),
        title: ["Realms", "Государства"],
        text: ["Open «Realms» and pick one: its card tells its form of rule, its lands and its friends and foes.", "Откройте «Государства» и выберите державу: её карточка расскажет о правлении, землях, друзьях и врагах."],
      },
      {
        target: '[data-tab="place"]',
        title: ["Back to the place", "Назад к месту"],
        text: [
          "With nothing picked, «Place» shows the world itself: its year, age, magic and how long all its roads are.",
          "Когда ничего не выбрано, «Место» показывает сам мир: год, эпоху, магию и длину всех дорог.",
        ],
      },
    ],
  },
  {
    id: "history",
    icon: "📜",
    group: "planet",
    title: ["History and ages", "История и эпохи"],
    about: ["A world that lived its centuries, the map of any year, and the setting.", "Мир, проживший века, карта любого года и сеттинг."],
    tops: PLANET,
    demo: "kingdoms",
    steps: [
      {
        before: show("planet"),
        target: '[data-section="planet-age"]',
        title: ["A world with a past", "Мир с прошлым"],
        text: [
          "A world with a history shows its year here, and «25 years pass», «100 years pass» carry it on. A world without one can live 300 years: realms, towns, wars and rulers come out of the simulation.",
          "У мира с историей здесь виден текущий год, а «Прошло 25 лет» и «Прошло 100 лет» продолжают её. Мир без истории можно «прожить» на 300 лет — державы, города, войны и правители выйдут из симуляции.",
        ],
      },
      {
        target: '[data-section="planet-age"] label.check',
        done: () => checked('[data-section="planet-age"] input[type="checkbox"]'),
        title: ["The map of the past", "Карта прошлого"],
        text: ["Tick «Show the map of a past year».", "Включите «Показать карту прошлого года»."],
      },
      {
        target: '[data-section="planet-age"] input[type="range"]',
        change: () => $<HTMLInputElement>('[data-section="planet-age"] input[type="range"]')?.value,
        title: ["Pick a year", "Выберите год"],
        text: ["Move the slider: the borders, towns and roads of that year.", "Передвиньте ползунок — границы, города и дороги того года."],
      },
      {
        target: '[data-section="planet-age"] label.check',
        done: () => !checked('[data-section="planet-age"] input[type="checkbox"]'),
        title: ["Back to today", "Вернитесь в настоящее"],
        text: ["Clear the tick.", "Снимите галочку."],
      },
      {
        target: '[data-tab="chronicle"]',
        done: () => pressed('[data-tab="chronicle"]'),
        title: ["The chronicle", "Летопись"],
        text: [
          "Open «Chronicle»: every event by year, with a filter by kind — wars, rulers, towns, disasters. A click on an event shows its place.",
          "Откройте «Летопись»: все события по годам и фильтр по видам — войны, правители, города, бедствия. Щелчок по событию показывает его место.",
        ],
      },
      {
        target: "aside.inspector",
        title: ["Stories of realms and towns", "История держав и городов"],
        text: [
          "A realm's card tells its rulers and dynasties, a town's card its own story. The layer «Marks of history» shows the battles, sieges, plagues and risings of the last century.",
          "В карточке державы — её правители и династии, в карточке города — его история. Слой «Знаки истории» отмечает битвы, осады, мор и восстания последнего века.",
        ],
      },
      {
        target: '[data-section="planet-age"] .setting',
        title: ["Age and setting", "Эпоха и сеттинг"],
        text: [
          "The age changes everything: towns, realms, roads, armies, arms, map styles. Mixes join ages, and «Own setting» sets technology, transport, magic, decline and rule with sliders.",
          "Эпоха меняет всё: города, державы, дороги, армии, гербы, стили карт. Смеси соединяют эпохи, а «Свой сеттинг» задаёт технологии, транспорт, магию, упадок и власть ползунками.",
        ],
      },
      {
        target: ".world-button",
        title: ["The whole world's setting", "Сеттинг всего мира"],
        text: ["In 📚 the setting is set for the whole world: it falls on all its maps at once.", "В 📚 сеттинг задаётся всему миру — он ложится сразу на все его карты."],
      },
    ],
  },
  {
    id: "editor",
    icon: "✏️",
    group: "planet",
    title: ["The planet's editor", "Редактор планеты"],
    about: ["Relief brushes, whose land is whose, towns, labels and zones.", "Кисти рельефа, чья земля, города, надписи и зоны."],
    tops: PLANET,
    demo: "kingdoms",
    steps: [
      {
        before: show("planet"),
        target: "aside.controls details.editor",
        done: () => !!$<HTMLDetailsElement>("aside.controls details.editor")?.open,
        title: ["Open the editor", "Откройте редактор"],
        text: ["Press «✏️ World editor». (On the globe it is hidden: switch to the map.)", "Нажмите «✏️ Редактор мира». (На глобусе редактор скрыт — переключитесь на карту.)"],
      },
      {
        target: "aside.controls details.editor",
        gesture: "drag",
        title: ["Relief brushes", "Кисти рельефа"],
        text: [
          "Raise, lower, smooth, level, sink — with a brush; ridge and trench — two clicks. Brush size and strength are sliders. After a stroke the world grows again around it.",
          "Поднять, опустить, сгладить, выровнять, утопить — кистью; хребет и впадина — двумя щелчками. Размер кисти и сила — ползунками. После мазка мир дорастает заново.",
        ],
      },
      {
        target: "aside.controls details.editor",
        title: ["Whose land", "Чья земля"],
        text: [
          "«To a realm», «To a people», «To a faith», «To a province»: the brush hands land over; whom to is picked in the list under the tools.",
          "«Державе», «Народу», «Вере», «Провинции» — кистью отдают землю; кому — выбирается в списке под инструментами.",
        ],
      },
      {
        target: "aside.controls details.editor",
        title: ["Towns, labels, zones", "Города, надписи, зоны"],
        text: [
          "Move a town (two clicks), found one, remove one (not a capital). A label, a zone — a front, plague, famine, bandits, a magic storm, radiation or your own — and a close-up of an area by two corners.",
          "Перенести город (два щелчка), основать, убрать (кроме столицы). Надпись, зона — фронт, мор, голод, разбойники, магическая буря, радиация или своя — и крупный план области по двум углам.",
        ],
      },
      {
        target: "aside.controls details.editor",
        title: ["A realm and a town", "Держава и город"],
        text: [
          "Pick a realm or a town on the map: their edit appears in the editor — form of rule, colour, capital, joining, relations; for a town people, walls, port, «Make capital», «Raise a realm here».",
          "Выберите на карте державу или город — в редакторе появится их правка: форма правления, цвет, столица, присоединение, отношения; у города — жители, стены, порт, «Сделать столицей», «Поднять здесь державу».",
        ],
      },
      {
        target: "aside.controls details.editor",
        title: ["Relief from a picture or GeoJSON", "Рельеф из картинки и GeoJSON"],
        text: [
          "A height picture (light is high) or a GeoJSON with heights and names — for example Azgaar's Fantasy Map Generator «cells» and «burgs» — becomes the planet's relief.",
          "Картинка высот (светлое — высоко) или GeoJSON с высотами и названиями — например, выгрузка Azgaar's Fantasy Map Generator «cells» и «burgs» — становится рельефом планеты.",
        ],
      },
      {
        target: "aside.controls details.editor .gm-row",
        title: ["Your edits", "Ваши правки"],
        text: [
          "At the bottom: how many edits, «Undo» and «Reset all edits». Edits lie over the generation: the same seed with them gives the same map. Press a tool again to put it down.",
          "Внизу — сколько правок, «Отменить» и «Сбросить все правки». Правки лежат поверх генерации: тот же сид с ними даёт ту же карту. Повторное нажатие отпускает инструмент.",
        ],
      },
    ],
  },
  {
    id: "region",
    icon: "🗺",
    group: "planet",
    title: ["Region and underworld", "Регион и подземный мир"],
    about: ["A land close up with its villages, and the caverns under the world.", "Край вблизи с деревнями и пещеры под миром."],
    tops: PLANET,
    demo: "kingdoms",
    steps: [
      {
        before: show("planet"),
        target: ".stage .map",
        gesture: "right",
        pass: true,
        done: () => at("region"),
        title: ["Open a region", "Откройте регион"],
        text: [
          "Double-click land inside a province (not a town), or right-click and pick «Open the region map».",
          "Дважды щёлкните по суше в провинции (не по городу) или выберите в меню правой кнопки «Открыть карту региона».",
        ],
      },
      {
        target: "aside.inspector",
        title: ["The region close up", "Регион вблизи"],
        text: [
          "Villages and hamlets, fields and land use, estates, woods, hills and marshes. With nothing picked, the card counts towns, villages, people and land.",
          "Деревни и хутора, поля и угодья, волости, леса, холмы и болота. Без выбора карточка считает города, деревни, жителей и угодья.",
        ],
      },
      {
        target: "svg.locator",
        title: ["Where it is", "Где это"],
        text: ["The planet with the region's frame. Below it, the neighbouring provinces: a click opens the next region.", "Планета с рамкой региона. Ниже — соседние провинции: щелчок открывает соседний регион."],
      },
      {
        target: '[data-section="region-view"]',
        title: ["The region's layers", "Слои региона"],
        text: ["Two layers only the region has: land use and estates.", "Два слоя есть только у региона: землепользование и волости."],
      },
      {
        target: '[data-tour="underworld"]',
        pass: true,
        done: () => at("underworld"),
        title: ["Go underground", "Спуститесь под землю"],
        text: ["Press «Open the underworld».", "Нажмите «Открыть подземный мир»."],
      },
      {
        target: "aside.controls .row-buttons",
        title: ["Plan and section", "План и разрез"],
        text: [
          "«Plan» is the view from above, «Section» the cut by depth. The ticks lay the surface and the lands of the peoples over it.",
          "«План» — вид сверху, «Разрез» — срез по глубине. Галочки накладывают поверхность и земли народов.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "click",
        change: picked,
        title: ["Pick a cavern", "Выберите пещеру"],
        text: [
          "Its depth, people, tunnels to the neighbours, the way down from above, the town over it, and «Open the place map».",
          "Глубина, народ, ходы к соседям, спуск сверху, город наверху и «Открыть карту места».",
        ],
      },
      {
        target: "aside.controls details.custom-kinds",
        title: ["Edit the underworld", "Правка подземья"],
        text: ["Add a cavern, dig a tunnel from the picked one, cut a tunnel, take a cavern away.", "Добавить пещеру, прорыть ход от выбранной, перерезать ход, убрать пещеру."],
      },
    ],
  },
  {
    id: "city",
    icon: "🏰",
    group: "towns",
    title: ["The city", "Город"],
    about: ["Wards, tiers, factions, places and the GM's edits.", "Кварталы, ярусы, фракции, места и правка мастера."],
    tops: ["planet", "city"],
    demo: "kingdoms",
    steps: [
      {
        before: show("city"),
        target: '[data-level="planet"]',
        pass: true,
        done: () => at("city"),
        title: ["Open a city", "Откройте город"],
        text: [
          "If no city is open yet: on the planet, double-click a town, or press «Open the city map» on its card.",
          "Если город ещё не открыт: на планете дважды щёлкните по городу или нажмите «Открыть карту города» в его карточке.",
        ],
      },
      {
        target: "aside.controls",
        title: ["The city's settings", "Настройки города"],
        text: [
          "Age, settlement (city, village, hamlet), people, the sea and the river, walls, citadel, port, temple, market, slums. «Create» at the top applies them. A city opened from a planet takes its coast, river and roads from there.",
          "Эпоха, поселение (город, деревня, хутор), жители, море и река, стены, цитадель, порт, храм, рынок, трущобы. Применяет их «Создать» вверху. Город с планеты берёт оттуда берег, реку и дороги.",
        ],
      },
      {
        target: "aside.controls details.editor",
        title: ["Growth and terrain", "Рост и местность"],
        text: [
          "«Growth in layers of ages» builds an old core with newer rings around it; then hills, a lake, gates on the real roads, a capital with its palace, nomads at the gates and magic.",
          "«Рост слоями эпох» строит старое ядро и новые кольца вокруг; ещё холмы, озеро, ворота на настоящих трактах, столица с дворцом, кочевники у ворот и магия.",
        ],
      },
      {
        target: "aside.controls > .floor-tabs",
        title: ["Tiers", "Ярусы"],
        text: [
          "Streets, roofs or the upper tier, catacombs and sewers or the undercity — each age has its own. Below, the halls open as dungeon maps.",
          "Улицы, крыши или верхний ярус, катакомбы и стоки или нижний город — у каждой эпохи свои. Внизу залы открываются картой подземелья.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "click",
        change: picked,
        title: ["Pick a ward", "Выберите квартал"],
        text: [
          "Click a ward: its size, people, wealth, who holds it, crafts, headman, rumours and a hook for the GM.",
          "Щёлкните по кварталу: площадь, жители, достаток, чья власть, ремёсла, староста, слухи и завязка для мастера.",
        ],
      },
      {
        target: "aside.inspector .card",
        title: ["Close up and inside", "Крупно и внутрь"],
        text: [
          "«Open the district close up» shows the ward house by house. A house has «Open the building plan»; a temple or a crypt has a way down.",
          "«Открыть район крупно» показывает квартал дом за домом. У дома — «Открыть план здания», у храма или склепа — спуск вниз.",
        ],
      },
      {
        target: "aside.inspector nav.tabs",
        title: ["Lists", "Списки"],
        text: ["Wards, places, streets, factions and the directory of shops. The field above finds a ward, a place, a person or a street.", "Кварталы, места, улицы, фракции и справочник лавок. Поле сверху ищет квартал, место, человека или улицу."],
      },
      {
        target: '[data-tab="factions"]',
        done: () => pressed('[data-tab="factions"]'),
        title: ["Factions", "Фракции"],
        text: [
          "Open «Factions»: who wants what, who are rivals and allies, who holds which wards. The layer «Faction influence» tints the wards by their holders.",
          "Откройте «Фракции»: кто чего хочет, кто с кем враждует и дружит, кто держит кварталы. Слой «Влияние фракций» красит кварталы по хозяевам.",
        ],
      },
      {
        target: '[data-tab="directory"]',
        done: () => pressed('[data-tab="directory"]'),
        title: ["The directory", "Справочник лавок"],
        text: ["The city's shops; the whole list copies as text for the players.", "Лавки города; весь список копируется текстом для игроков."],
      },
      {
        target: "aside.controls .ways",
        title: ["Around and below", "Вокруг и вниз"],
        text: ["«Outskirts» is the land around the city, «Deeper» the underworld under it.", "«Окрестности» — местность вокруг города, «Глубже» — подземный мир под ним."],
      },
      {
        target: "aside.controls details.custom-kinds",
        title: ["Your own wards and places", "Свои кварталы и места"],
        text: [
          "Your kinds of wards, and your places with a description, a secret and what they open into. «Create» puts them on the map.",
          "Свои виды кварталов и свои места — с описанием, тайной и тем, во что место открывается. «Создать» расставит их.",
        ],
      },
      {
        target: "aside.inspector",
        title: ["The GM's edits", "Правка мастера"],
        text: [
          "A picked ward, place or the gates are edited in their cards: the kind, the wealth, moving a place, a new gate cut in the wall, a building made a place.",
          "Выбранный квартал, место или ворота правятся в их карточках: вид, достаток, перенос места, новые ворота в стене, дом, ставший местом.",
        ],
      },
    ],
  },
  {
    id: "building",
    icon: "🏠",
    group: "towns",
    title: ["The building", "Здание"],
    about: ["Floors, rooms, doors and the key, ready to print.", "Этажи, комнаты, двери и ключ — готово к печати."],
    tops: ["planet", "city", "building"],
    demo: "kingdoms",
    steps: [
      {
        before: show("building"),
        target: '[data-level="city"]',
        pass: true,
        done: () => at("building"),
        title: ["Open a building", "Откройте здание"],
        text: [
          "If no building is open yet: in a city, pick a house or a place and press «Open the building plan».",
          "Если здание ещё не открыто: в городе выберите дом или место и нажмите «Открыть план здания».",
        ],
      },
      {
        target: "aside.controls .floor-tabs",
        change: () => $("aside.controls .floor-tabs [aria-pressed=\"true\"]")?.textContent ?? "",
        title: ["Floors", "Этажи"],
        text: ["Cellar, floors, attic; «Roof» shows the building from above. Switch the floor.", "Подвал, этажи, чердак; «Крыша» показывает здание сверху. Переключите этаж."],
      },
      {
        target: "aside.controls",
        title: ["The building's settings", "Настройки здания"],
        text: [
          "Building types of this age and others, the shape (rectangle, L, T, U, court, round tower), size and floors, cellar, yard, attic, a hatch down, walls, decline, magic, style and a battle grid.",
          "Типы зданий этой и других эпох, форма (прямоугольник, Г, Т, П, двор, круглая башня), размеры и этажи, подвал, двор, чердак, люк вниз, стены, упадок, магия, стиль и сетка для боя.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "click",
        change: picked,
        title: ["Pick a room", "Выберите комнату"],
        text: [
          "Its size, furniture, people, valuables and clues (for the GM), rumours, and where you can go from it.",
          "Размер, обстановка, люди, ценности и улики (для мастера), слухи и куда отсюда можно пройти.",
        ],
      },
      {
        target: "aside.inspector .card .ways",
        title: ["Doors and stairs", "Двери и лестницы"],
        text: ["The doors to the next rooms and the stairs between floors.", "Двери в соседние комнаты и лестницы между этажами."],
      },
      {
        target: "aside.inspector .card",
        title: ["A room for a scene", "Комната для сцены"],
        text: [
          "«Open the room for a scene» makes a battle map of the room with its cover. A hatch and the cellar lead down into a dungeon.",
          "«Открыть комнату для сцены» — боевая карта комнаты с укрытиями. Люк и подвал ведут вниз, в подземелье.",
        ],
      },
      {
        target: "aside.inspector ul.list.keyed",
        title: ["The key", "Ключ этажа"],
        text: ["Every room with its number, as in a printed adventure.", "Каждая комната под своим номером — как в печатном модуле."],
      },
      {
        target: "aside.inspector",
        title: ["Edit a room", "Правка комнаты"],
        text: [
          "«✎ Edit the room»: what it is for, its doors (kind, lock, secret, walled up) and a new door into a room behind a wall.",
          "«✎ Правка комнаты»: назначение, двери (вид, замок, потайная, заложена) и новая дверь в комнату за стеной.",
        ],
      },
      {
        before: () => {
          $('[data-tour="whole-building"]')?.click();
        },
        target: '[data-tour="print-sheet"]',
        title: ["The printed sheet", "Печатный лист"],
        text: [
          "With no room picked, the building's card prints every floor and the room key on paper.",
          "Когда комната не выбрана, карточка здания печатает все этажи и ключ комнат на бумаге.",
        ],
      },
      {
        target: "aside.controls details.custom-kinds",
        title: ["Your own building types", "Свои типы зданий"],
        text: ["Size, floors and the rooms of each floor for a building of your own.", "Размеры, этажи и набор комнат по этажам для своего здания."],
      },
    ],
  },
  {
    id: "local",
    icon: "🗝",
    group: "towns",
    title: ["Local maps and dungeons", "Местность и подземелья"],
    about: ["Dungeons, caves and wild lands with their key.", "Подземелья, пещеры и дикие земли с ключом."],
    tops: ["planet", "city", "building", "local"],
    demo: "crypt",
    steps: [
      {
        before: show("local"),
        target: ".views",
        pass: true,
        done: () => at("local"),
        title: ["Open a local map", "Откройте местность"],
        text: [
          "If none is open yet: on the planet, double-click a cave or ruins, or right-click and pick «Local map here»; in a city, press «Outskirts».",
          "Если местность ещё не открыта: на планете дважды щёлкните по пещере или руинам либо выберите в меню правой кнопки «Карта местности здесь»; в городе — «Окрестности».",
        ],
      },
      {
        target: "aside.controls",
        title: ["The kind and the theme", "Вид и обстановка"],
        text: [
          "A dungeon, a cave or the wilds; a theme from a crypt or a mine to a starship, from a forest to the sea floor; size, rooms, danger 1–3, style, grid and letters with numbers on the edges.",
          "Подземелье, пещера или дикая местность; обстановка — от склепа и рудника до звездолёта, от леса до морского дна; размер, комнаты, опасность 1–3, стиль, сетка и буквы с цифрами по краям.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "click",
        change: () => $(".room-card")?.textContent?.slice(0, 80) ?? "",
        title: ["Pick a room", "Выберите комнату"],
        text: [
          "Its text to read aloud, who is there, loot and traps (for the GM), and where its ways lead.",
          "Текст для чтения вслух, кто здесь, добыча и ловушки (для мастера) и куда ведут ходы.",
        ],
      },
      {
        target: "aside.inspector ul.list.keyed",
        title: ["The key of the place", "Ключ места"],
        text: ["All the rooms by number.", "Все комнаты по номерам."],
      },
      {
        target: "ol.wandering",
        title: ["Wanderers", "Бродячие"],
        text: ["A d6 table of wandering monsters.", "Таблица бродячих монстров на к6."],
      },
      {
        target: ".room-card",
        title: ["Scene and edit", "Сцена и правка"],
        text: [
          "«🎭 As a scene» opens the room close up with its bands and light; «✎ Edit» sets its purpose, bands, loot, trap and your own description.",
          "«🎭 Сценой» открывает комнату крупно, с отрядами и светом; «✎ Править» — назначение, отряды, добыча, ловушка и своё описание.",
        ],
      },
      {
        target: '[data-tour="local-down"]',
        title: ["Deeper", "Глубже"],
        text: [
          "Where the map has stairs down, «Go a level down» builds the next level, larger and more dangerous; «Go a level up» comes back.",
          "Если на карте есть лестница вниз, «Спуститься на уровень ниже» строит следующий уровень — больше и опаснее; «Подняться» возвращает.",
        ],
      },
      {
        target: "aside.controls details.custom-kinds",
        title: ["Your rooms, themes and tables", "Свои комнаты, темы и таблицы"],
        text: [
          "Your kinds of rooms, dungeon themes and tables of dwellers, loot and traps; «Apply to this map» rebuilds it with them. The wilds also go on sheet by sheet with the arrows.",
          "Свои виды комнат, темы подземелий и таблицы обитателей, добычи и ловушек; «Применить к этой карте» перестраивает её. Дикая местность продолжается соседними листами по стрелкам.",
        ],
      },
    ],
  },
  {
    id: "universe",
    icon: "🌠",
    group: "space",
    title: ["The universe", "Вселенная"],
    about: ["Galaxies, superclusters, voids, strange things and powers.", "Галактики, сверхскопления, пустоты, странности и державы."],
    tops: ["universe"],
    demo: "cosmos",
    steps: [
      {
        before: show("universe"),
        target: "aside.controls",
        title: ["Cosmology", "Космология"],
        text: [
          "A cosmic web, crystal spheres or planes of being; scale, galaxies, superclusters and voids, how many have civilisations, the universe's age and strangeness.",
          "Космическая паутина, хрустальные сферы или планы бытия; масштаб, число галактик, сверхскоплений и пустот, доля цивилизаций, возраст вселенной и странности.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "click",
        done: () => shown("aside.inspector .card button.primary"),
        title: ["Pick a galaxy", "Выберите галактику"],
        text: ["Its kind, stars, civilisations, powers, gates and the ways along the filaments.", "Вид, звёзды, цивилизации, державы, врата и пути по нитям."],
      },
      {
        target: "aside.inspector .card .primary",
        gesture: "double",
        title: ["Into the galaxy", "Внутрь галактики"],
        text: ["«Open the galaxy» — or double-click the galaxy on the map.", "«Открыть галактику» — или двойной щелчок по галактике на карте."],
      },
      {
        target: "aside.inspector nav.tabs",
        title: ["Lists", "Списки"],
        text: [
          "Galaxies, clusters, voids, the strange and the powers. Galaxies have a search and a filter, and the finds are ringed on the map.",
          "Галактики, скопления, пустоты, странное и державы. У галактик — поиск и фильтр, найденные обводятся на карте.",
        ],
      },
      {
        target: '[data-tour="universe-ruler"]',
        done: () => pressed('[data-tour="universe-ruler"]'),
        title: ["A ruler along the filaments", "Линейка по нитям"],
        text: ["Press it and click two galaxies: the length of the way and how many hops.", "Нажмите и щёлкните по двум галактикам — длина пути и число переходов."],
      },
      {
        target: "aside.controls details.custom-kinds",
        title: ["Your own things", "Свои объекты"],
        text: [
          "A mark, a colour, how many and where, an area, a description, what it opens into, and a secret only the GM sees. They appear after «Create».",
          "Знак, цвет, сколько и где, область, описание, во что открывается и тайна, которую видит только мастер. Появятся после «Создать».",
        ],
      },
      {
        target: "aside.inspector",
        title: ["Edit a galaxy", "Правка галактики"],
        text: ["In the galaxy's card: its kind, stars, civilisations and «📍 You are here».", "В карточке галактики: вид, звёзды, цивилизации и «📍 Вы здесь»."],
      },
    ],
  },
  {
    id: "galaxy",
    icon: "🌌",
    group: "space",
    title: ["The galaxy", "Галактика"],
    about: ["Stars, powers, lanes, sectors and the galaxy's editor.", "Звёзды, державы, пути, сектора и редактор галактики."],
    tops: ["universe", "galaxy"],
    demo: "opera",
    steps: [
      {
        before: show("galaxy"),
        target: ".views",
        pass: true,
        done: () => at("galaxy"),
        title: ["Open a galaxy", "Откройте галактику"],
        text: ["If none is open yet: in the universe, pick a galaxy and press «Open the galaxy».", "Если галактика ещё не открыта: во вселенной выберите галактику и нажмите «Открыть галактику»."],
      },
      {
        target: "aside.controls",
        title: ["Shape and layers", "Форма и слои"],
        text: [
          "Shape, stars, arms, powers, strangeness. Layers: holdings, borders, sectors, the grid, hyperlanes, trade routes, dangerous ways and zones.",
          "Форма, звёзды, рукава, державы, странности. Слои: владения, границы, сектора, сетка, гиперпути, торговые трассы, опасные пути и зоны.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "click",
        done: () => shown("aside.inspector .card button.primary"),
        title: ["Pick a star", "Выберите звезду"],
        text: [
          "Its class, owner, the world's profile (starport, tech, trade codes), hyperlanes, people and rumours.",
          "Класс, владелец, профиль мира (космопорт, техуровень, торговые коды), гиперпути, люди и слухи.",
        ],
      },
      {
        target: "aside.inspector .card .primary",
        title: ["Into the system", "В систему"],
        text: ["«Open the star system»; a star's feature may also open a place map.", "«Открыть звёздную систему»; у особенности звезды бывает и «Открыть карту места»."],
      },
      {
        target: "aside.inspector nav.tabs",
        title: ["Powers, stars, regions, sectors", "Державы, звёзды, области, сектора"],
        text: [
          "Notable stars filter by owner, starport, zone and tag. A sector opens as a hex map.",
          "Заметные звёзды фильтруются по владельцу, космопорту, зоне и тегу. Сектор открывается шестигранной картой.",
        ],
      },
      {
        target: "aside.controls details.editor",
        title: ["The galaxy's editor", "Редактор галактики"],
        text: [
          "Repaint a star to a power, move a capital, lay or cut a lane, link two stars with gates. A star's own edit is in its card.",
          "Перекрасить звезду державе, перенести столицу, проложить или разорвать путь, связать две звезды вратами. Правка самой звезды — в её карточке.",
        ],
      },
      {
        target: "aside.controls details.custom-kinds",
        title: ["Your own kinds", "Свои виды"],
        text: ["Your wonders and zones of the galaxy, with a secret if you want one.", "Свои чудеса и зоны галактики — с тайной, если нужно."],
      },
    ],
  },
  {
    id: "system",
    icon: "☀️",
    group: "space",
    title: ["The star system", "Звёздная система"],
    about: ["Worlds, orbits, stations and the way out.", "Миры, орбиты, станции и выходы."],
    tops: ["universe", "galaxy", "system"],
    demo: "opera",
    steps: [
      {
        before: show("system"),
        target: ".views",
        pass: true,
        done: () => at("system"),
        title: ["Open a system", "Откройте систему"],
        text: ["If none is open yet: in the galaxy, pick a star and press «Open the star system».", "Если система ещё не открыта: в галактике выберите звезду и нажмите «Открыть звёздную систему»."],
      },
      {
        target: "aside.controls .floor-tabs",
        title: ["Scheme and orbits", "Схема и орбиты"],
        text: ["«Orbits» draws the worlds on their orbits, and a date slider moves them through their years.", "«Орбиты» рисует миры на их орбитах, а ползунок даты двигает их по годам."],
      },
      {
        target: ".stage .map",
        gesture: "click",
        change: picked,
        title: ["Pick a world", "Выберите мир"],
        text: [
          "Its figures, the sky and the calendar, «Open the planet», the main city or a habitat.",
          "Данные мира, небо и календарь, «Открыть планету», главный город или хабитат.",
        ],
      },
      {
        target: "aside.inspector",
        title: ["Worlds, places, exits", "Миры, места, выходы"],
        text: [
          "★ is the main world, 🌱 a habitable one. The exits — gates, wormholes, lanes — open the next system with a click.",
          "★ — главный мир, 🌱 — обитаемый. Выходы — врата, червоточины, пути — открывают соседнюю систему щелчком.",
        ],
      },
      {
        target: "aside.controls details.editor",
        title: ["The system's editor", "Редактор системы"],
        text: ["Add a world on an orbit, take one away, set who owns the system.", "Добавить мир на орбиту, убрать мир, задать владельца системы."],
      },
      {
        target: '[data-tour="print-card"]',
        title: ["A card to print", "Карточка для печати"],
        text: ["The star, the main world's profile, the worlds and the places on one sheet.", "Звезда, профиль главного мира, миры и места на одном листе."],
      },
    ],
  },
  {
    id: "gm",
    icon: "🎲",
    group: "table",
    title: ["The GM's layer", "Слой мастера"],
    about: ["Pins, fog of war, names, notes and the players' view.", "Метки, туман войны, имена, заметки и вид для игроков."],
    steps: [
      {
        before: gmOpen,
        target: ".gm",
        title: ["Over any map", "Поверх любой карты"],
        text: ["Pins, fog, names and notes lie over the map and never touch what was generated.", "Метки, туман, имена и заметки лежат поверх карты и не трогают сгенерированное."],
      },
      {
        target: ".gm-modes",
        title: ["Modes", "Режимы"],
        text: [
          "«Inspect» is the usual click; «Pin» puts a pin where you click; «Reveal» and «Cover» are the fog brush.",
          "«Смотреть» — обычный клик; «Метка» ставит метку по щелчку; «Открыть» и «Скрыть» — кисть тумана.",
        ],
      },
      {
        target: '[data-tour="fog"]',
        done: () => checked('[data-tour="fog"] input'),
        title: ["Fog of war", "Туман войны"],
        text: [
          "Tick «Fog of war»: the map goes dark, and the «Reveal» brush shows the players what they have explored. «Cover all» hides it again.",
          "Включите «Туман войны»: карта скроется, а кисть «Открыть» покажет игрокам пройденное. «Скрыть всё» закроет снова.",
        ],
      },
      {
        target: ".stage .map",
        gesture: "drag",
        title: ["Reveal", "Открыть"],
        text: ["Pick «Reveal» and drag over the map; the brush size is under the modes.", "Выберите «Открыть» и проведите по карте; размер кисти — под режимами."],
      },
      {
        target: '[data-tour="fog"]',
        pass: true,
        done: () => !checked('[data-tour="fog"] input'),
        title: ["Fog off", "Туман прочь"],
        text: ["Clear the tick while you do not need the fog.", "Снимите галочку, пока туман не нужен."],
      },
      {
        target: ".stage .map",
        gesture: "click",
        before: () => {
          $<HTMLButtonElement>(".gm-modes button")?.click();
        },
        done: () => shown(".gm .gm-block textarea"),
        title: ["Name and notes", "Имя и заметки"],
        text: ["Pick a place on the map: the GM's panel gives it a new name and notes that only you see.", "Выберите место на карте — в панели мастера появятся новое имя и заметки, которые видите только вы."],
      },
      {
        target: ".gm .gm-block .row-buttons",
        title: ["Page and description", "Страница и описание"],
        text: ["📖 is the place's page in the handbook, 📋 copies its description in Markdown.", "📖 — страница этого места в справочнике, 📋 копирует его описание в Markdown."],
      },
      {
        target: '[data-tour="players"]',
        done: () => shown(".app.players"),
        title: ["The players' view", "Вид для игроков"],
        text: [
          "It hides the panels, hidden pins and secrets — for a second screen or a projector. Turn it on.",
          "Прячет панели, скрытые метки и тайны — для второго экрана или проектора. Включите его.",
        ],
      },
      {
        target: ".gm-min",
        pass: true,
        done: () => !shown(".app.players"),
        title: ["Back to the GM", "Назад к мастеру"],
        text: ["Press «Back to the GM view».", "Нажмите «Вернуться к виду мастера»."],
      },
      {
        target: ".gm",
        before: gmOpen,
        title: ["The campaign in a file", "Кампания в файле"],
        text: ["«Save campaign» and «Load campaign» carry the GM's layer as a file.", "«Сохранить кампанию» и «Загрузить кампанию» переносят слой мастера файлом."],
      },
    ],
  },
  {
    id: "handbook",
    icon: "📖",
    group: "table",
    title: ["The handbook", "Справочник"],
    about: ["A page for every place, links between them and the printed atlas.", "Страница у каждого места, ссылки между ними и атлас-книга."],
    steps: [
      {
        before: gmOpen,
        target: ".stage .map",
        gesture: "click",
        done: () => shown(".gm .gm-block .row-buttons"),
        title: ["Pick a place", "Выберите место"],
        text: ["Click a place on the map.", "Щёлкните по месту на карте."],
      },
      {
        target: ".gm .gm-block .row-buttons button",
        done: () => shown("dialog.handbook"),
        title: ["Its page", "Его страница"],
        text: ["Press 📖 in the GM's panel.", "Нажмите 📖 в панели мастера."],
      },
      {
        before: () => {
          if (!shown("dialog.handbook")) $(".gm .gm-block .row-buttons button")?.click();
        },
        target: "dialog.handbook",
        title: ["Writing a page", "Как писать страницу"],
        text: [
          "Markdown: **bold**, lists, [[links]] to other pages. Apart from the text — the GM's secret, tags and a picture. A place has one page at every scale.",
          "Markdown: **жирный**, списки, [[ссылки]] на другие страницы. Отдельно — тайна мастера, теги и картинка. У места одна страница во всех масштабах.",
        ],
      },
      {
        keys: ["Esc"],
        pass: true,
        done: () => !shown("dialog.handbook"),
        title: ["Close it", "Закройте"],
        text: ["Esc or ✕.", "Esc или ✕."],
      },
      {
        target: '[data-tour="handbook"]',
        done: () => shown("dialog.handbook"),
        title: ["The whole handbook", "Весь справочник"],
        text: ["📖 at the top: every page, with a search and tags.", "📖 вверху — все страницы, с поиском и тегами."],
      },
      {
        before: () => {
          if (!shown("dialog.handbook")) $('[data-tour="handbook"]')?.click();
        },
        target: "dialog.handbook .row-buttons",
        title: ["Markdown and the atlas book", "Markdown и атлас-книга"],
        text: [
          "The handbook goes out as Markdown, with or without secrets, and «Atlas book to print» gathers a cover, every open map, the pages and an index of names.",
          "Справочник выгружается в Markdown — с тайнами или без, а «Атлас-книга для печати» собирает обложку, все открытые карты, страницы и указатель имён.",
        ],
      },
      {
        keys: ["Esc"],
        pass: true,
        done: () => !shown("dialog.handbook"),
        title: ["Close it", "Закройте"],
        text: ["Esc or ✕.", "Esc или ✕."],
      },
    ],
  },
  {
    id: "export",
    icon: "⬇",
    group: "table",
    title: ["Export and print", "Выгрузка и печать"],
    about: ["Pictures, data, the GM's secrets and paper.", "Картинки, данные, тайны мастера и бумага."],
    steps: [
      {
        target: '[data-tour="export"]',
        done: () => !!$<HTMLDetailsElement>('[data-tour="export"]')?.open,
        title: ["Open «Export»", "Откройте «Выгрузить»"],
        text: ["Press «Export».", "Нажмите «Выгрузить»."],
      },
      {
        target: '[data-tour="export"] > div',
        title: ["Formats", "Форматы"],
        text: [
          "SVG is a picture that stays sharp at any size, PNG goes to a chat or a VTT, JSON holds all of the map's data; some levels add their own, like GeoJSON on the planet. The Windows app asks where to save.",
          "SVG — картинка без потери качества, PNG — для чата и виртуального стола, JSON — все данные карты; у некоторых уровней свои форматы, например GeoJSON у планеты. Программа для Windows спросит, куда сохранить.",
        ],
      },
      {
        target: '[data-tour="export"] label.check',
        title: ["With the GM's secrets", "С тайнами мастера"],
        text: [
          "Adds hidden pins, all notes and the fogged land to the picture, and the GM's layer to the JSON. For the players, turn on the players' view first.",
          "Добавляет в картинку скрытые метки, все заметки и землю под туманом, а в JSON — слой мастера. Для игроков сначала включите вид для игроков.",
        ],
      },
      {
        target: '[data-tour="export"] > summary',
        pass: true,
        done: () => !$<HTMLDetailsElement>('[data-tour="export"]')?.open,
        title: ["Close the menu", "Закройте меню"],
        text: ["Press «Export» again.", "Нажмите «Выгрузить» ещё раз."],
      },
      {
        title: ["Paper", "Бумага"],
        text: [
          "The atlas book prints from the handbook, a building's sheet from its card, a system's card from the system's panel. The print window can also save a PDF.",
          "Атлас-книга печатается из справочника, лист здания — из его карточки, карточка системы — из панели системы. Окно печати умеет и сохранять PDF.",
        ],
      },
    ],
  },
  {
    id: "comfort",
    icon: "⚙",
    group: "table",
    title: ["Comforts", "Удобства"],
    about: ["Large type, units, alphabet, language and narrow screens.", "Крупный шрифт, единицы, алфавит, язык и узкие экраны."],
    steps: [
      {
        target: '[data-tour="large"]',
        title: ["Large type", "Крупный шрифт"],
        text: ["A+ makes the panels' type larger.", "A+ делает шрифт панелей крупнее."],
      },
      {
        target: '[data-tour="units"]',
        title: ["Units", "Единицы"],
        text: ["Kilometres or miles, for every map of the world.", "Километры или мили — для всех карт мира."],
      },
      {
        target: '[data-tour="script"]',
        title: ["The alphabet of names", "Алфавит имён"],
        text: ["Names in Latin or Cyrillic letters.", "Имена латиницей или кириллицей."],
      },
      {
        target: '[data-tour="locale"]',
        title: ["Language", "Язык"],
        text: ["The Atlas speaks Russian and English.", "Атлас говорит по-русски и по-английски."],
      },
      {
        target: '[data-tour="help"]',
        keys: ["?"],
        title: ["The cheat sheet", "Шпаргалка"],
        text: ["Every key and mouse move on one card.", "Все клавиши и приёмы мыши на одной карточке."],
      },
      {
        title: ["Hints and narrow screens", "Подсказки и узкие экраны"],
        text: [
          "Hold the cursor over a setting and a hint says what it does. On a tablet or a narrow window the panels slide in with «Settings» and «What is there».",
          "Задержите курсор над настройкой — подсказка объяснит, что она делает. На планшете и в узком окне панели выдвигаются кнопками «Настройки» и «Что там».",
        ],
      },
    ],
  },
];
