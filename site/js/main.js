const sceneContainer = document.getElementById('sceneContainer');
const panelTitle = document.getElementById('panelTitle');
const panelContent = document.getElementById('panelContent');
const listContent = document.getElementById('listContent');
const islandPanel = document.getElementById('islandPanel');
const listPanel = document.getElementById('listPanel');
const searchInput = document.getElementById('searchInput');
const fallbackNotice = document.getElementById('fallbackNotice');
const timeLabel = document.getElementById('timeLabel');
const toast = document.getElementById('toast');

const root = document.documentElement;
const savedTheme = localStorage.getItem('sigma-theme') || 'sunrise';
const savedCollection = JSON.parse(localStorage.getItem('sigma-collection') || '[]');
const collection = new Set(savedCollection);
const sceneState = {
  theme: savedTheme,
  dayPhase: 'day',
  reducedMotion: localStorage.getItem('sigma-reduced-motion') === 'true',
  activeIslandId: null,
};

let data = null;
let scene;
let camera;
let renderer;
let islandGroup;
let labelLayer;
let people = [];
let hasWebGL = true;
const cameraState = {
  yaw: 0.7,
  pitch: 0.52,
  distance: 24,
  target: new THREE.Vector3(0, 1.5, 0),
};
const dragState = {
  active: false,
  lastX: 0,
  lastY: 0,
};

const islandPositions = [
  { x: -8.2, z: -3.4 },
  { x: 9.4, z: -2.8 },
  { x: 0.2, z: 9.3 },
  { x: -10.8, z: 8.7 },
  { x: 10.6, z: 8.6 },
];

const phasePalette = {
  day: { sky: '#dfeefb', water: '#6FD0E5', sun: '#ffd57a', ambient: 1.1, dir: 1 },
  dusk: { sky: '#f0b37f', water: '#5b76a9', sun: '#ffb968', ambient: 0.7, dir: 0.8 },
  night: { sky: '#091b2f', water: '#102c45', sun: '#b5d8ff', ambient: 0.42, dir: 0.38 },
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function updateTheme(themeName) {
  root.setAttribute('data-theme', themeName);
  localStorage.setItem('sigma-theme', themeName);
  document.querySelectorAll('.theme-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === themeName);
  });
}

function setDayPhase(phase) {
  sceneState.dayPhase = phase;
  const palette = phasePalette[phase];
  document.getElementById('toggleDayNight').textContent = `晝夜：${phase === 'day' ? '白天' : phase === 'dusk' ? '黃昏' : '夜晚'}`;

  if (scene) {
    scene.background = new THREE.Color(palette.sky);
    const skyLight = scene.getObjectByName('skyLight');
    if (skyLight) {
      skyLight.material.color.set(palette.sun);
      skyLight.intensity = palette.dir;
    }
    const hemi = scene.getObjectByName('hemiLight');
    if (hemi) hemi.intensity = palette.ambient;
    const dir = scene.getObjectByName('dirLight');
    if (dir) dir.intensity = palette.dir;
    const water = scene.getObjectByName('water');
    if (water) water.material.color.set(palette.water);
  }
}

function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  timeLabel.textContent = timeString;
}

function renderPanelContent(island) {
  if (!island) return;
  const pointsHtml = island.points.map((point) => `<li>${point}</li>`).join('');
  const linkHtml = island.link
    ? `<li><a href="${island.link}" target="_blank" rel="noopener">前往連結</a></li>`
    : '<li class="text-note">此島沒有外部連結。</li>';

  panelTitle.textContent = island.name;
  panelContent.innerHTML = `
    <div class="meta-line">
      <span class="badge">${island.category || '生活感地點'}</span>
      <span class="badge">${island.material || '示意內容'}</span>
    </div>
    <p class="big-copy">${island.intro}</p>
    <div class="section-card">
      <h3>內容重點</h3>
      <ul>${pointsHtml}</ul>
    </div>
    <div class="section-card">
      <h3>代表建築／物件</h3>
      <p class="list-copy">${island.extra}</p>
    </div>
    <div class="section-card">
      <h3>相關連結</h3>
      <ul class="link-list">${linkHtml}</ul>
    </div>
    <button class="action-link" type="button" id="toggleCollectionBtn">${collection.has(island.id) ? '已收藏' : '加入圖鑑'}</button>
  `;

  const collectionBtn = document.getElementById('toggleCollectionBtn');
  collectionBtn.addEventListener('click', () => {
    if (collection.has(island.id)) {
      collection.delete(island.id);
      showToast('已從圖鑑移除');
    } else {
      collection.add(island.id);
      showToast('已加入圖鑑');
    }
    localStorage.setItem('sigma-collection', JSON.stringify([...collection]));
    renderList();
    renderPanelContent(island);
  });
}

function renderList() {
  if (!data) return;
  const query = searchInput.value.trim().toLowerCase();
  const listItems = data.islands.filter((island) => {
    const haystack = [island.name, island.intro, island.extra, island.points.join(' '), island.material].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  listContent.innerHTML = listItems.map((island) => {
    const active = sceneState.activeIslandId === island.id ? 'active' : '';
    const collected = collection.has(island.id) ? '★' : '☆';
    return `
      <button class="list-item ${active}" type="button" data-island-id="${island.id}">
        <span>
          <span class="title">${island.name}</span>
          <span class="small">${island.material || '示意內容'}</span>
        </span>
        <span class="collect-pill" aria-label="收藏狀態">${collected}</span>
      </button>
    `;
  }).join('');

  listContent.querySelectorAll('[data-island-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.islandId;
      const island = data.islands.find((item) => item.id === id);
      if (island) openIsland(island.id, true);
    });
  });
}

function openIsland(id, focus = true) {
  if (!data) return;
  const island = data.islands.find((item) => item.id === id);
  if (!island) return;

  sceneState.activeIslandId = id;
  renderPanelContent(island);
  islandPanel.classList.remove('hidden');
  listPanel.classList.add('hidden');
  renderList();

  const target = islandGroup.children.find((child) => child.userData.islandId === id);
  if (target && focus) {
    cameraState.target.copy(target.position);
    cameraState.distance = 8;
    cameraState.pitch = 0.45;
    cameraState.yaw = Math.atan2(target.position.x, target.position.z) + Math.PI * 0.2;
    updateCamera();
  }
}

function createIslandMarker(island, index) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6 + index * 0.2, 2.1 + index * 0.25, 1.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x89bb9b, roughness: 0.8, metalness: 0.1 })
  );
  base.position.y = 0.5;
  group.add(base);

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(1.4 + index * 0.18, 1.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x87d1b3, roughness: 0.78 })
  );
  top.position.y = 1.8;
  group.add(top);

  const landmark = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.3, 0.8),
    new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0xe3ae67 : 0x7ca6d9, roughness: 0.8 })
  );
  landmark.position.set(0.9, 1.4, 0.6);
  group.add(landmark);

  const tree = new THREE.Group();
  const trunk = new THREE.Mesh( new THREE.CylinderGeometry(0.12, 0.15, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x7b4d2d }));
  trunk.position.set(-1.2, 0.9, -0.5);
  const leaves = new THREE.Mesh( new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial({ color: 0x5d9c6d }));
  leaves.position.set(-1.2, 1.52, -0.5);
  tree.add(trunk, leaves);
  group.add(tree);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'island-label';
  labelDiv.textContent = island.name;
  labelDiv.style.pointerEvents = 'none';
  labelLayer.appendChild(labelDiv);

  const islandObj = new THREE.Group();
  islandObj.add(group);
  const position = islandPositions[index % islandPositions.length];
  islandObj.position.set(position.x, 0, position.z);
  islandObj.rotation.y = index * 0.9;
  islandObj.userData = { islandId: island.id, type: 'island' };
  islandGroup.add(islandObj);
  return islandObj;
}

function buildScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfeefb');

  camera = new THREE.PerspectiveCamera(42, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 200);
  camera.position.set(0, 8, 24);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
  renderer.shadowMap.enabled = true;
  sceneContainer.appendChild(renderer.domElement);

  labelLayer = document.createElement('div');
  labelLayer.className = 'scene-labels';
  sceneContainer.appendChild(labelLayer);

  const hemiLight = new THREE.HemisphereLight(0xfef3d2, 0x4f7d6f, 1.15);
  hemiLight.name = 'hemiLight';
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff6d6, 1);
  dirLight.position.set(12, 14, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.name = 'dirLight';
  scene.add(dirLight);

  const skyGlow = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xf6d7a6, side: THREE.BackSide })
  );
  skyGlow.name = 'skyLight';
  scene.add(skyGlow);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: '#6fd0e5', roughness: 0.6, metalness: 0.12 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.8;
  water.name = 'water';
  scene.add(water);

  const oceanRing = new THREE.Mesh(
    new THREE.RingGeometry(15, 23, 64),
    new THREE.MeshBasicMaterial({ color: 0x8ae1d4, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  oceanRing.rotation.x = -Math.PI / 2;
  oceanRing.position.y = -0.9;
  scene.add(oceanRing);

  islandGroup = new THREE.Group();
  scene.add(islandGroup);

  const centerIsland = new THREE.Group();
  centerIsland.position.set(0, 0, 0);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(5.1, 6.2, 1.8, 18),
    new THREE.MeshStandardMaterial({ color: 0x6cac88, roughness: 0.85 })
  );
  base.position.y = -0.2;
  centerIsland.add(base);

  const plateau = new THREE.Mesh(
    new THREE.CylinderGeometry(3.9, 4.9, 0.9, 18),
    new THREE.MeshStandardMaterial({ color: 0x9ed1a6, roughness: 0.8 })
  );
  plateau.position.y = 0.95;
  centerIsland.add(plateau);

  const museum = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.2, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xf3d3a6, roughness: 0.8 })
  );
  museum.position.set(0.8, 1.8, 1.1);
  centerIsland.add(museum);

  const museumRoof = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0xd9792f, roughness: 0.7 })
  );
  museumRoof.rotation.y = Math.PI / 4;
  museumRoof.position.set(0.8, 3.1, 1.1);
  centerIsland.add(museumRoof);

  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.1, 1, 10),
    new THREE.MeshStandardMaterial({ color: 0x7b9dd9, roughness: 0.8 })
  );
  stage.position.set(-1.6, 1.4, -1.4);
  centerIsland.add(stage);

  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.75, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x9ed5ef, roughness: 0.4 })
  );
  fountain.position.set(2, 1.25, -1.5);
  centerIsland.add(fountain);

  for (let i = 0; i < 14; i += 1) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a5e3f })
    );
    trunk.position.y = 0.38;
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 8, 8),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x69ad82 : 0x4f9b72 })
    );
    leaves.position.y = 0.95;
    tree.add(trunk, leaves);
    const angle = (i / 14) * Math.PI * 2;
    tree.position.set(Math.cos(angle) * 3.3, 1.2, Math.sin(angle) * 3.3);
    centerIsland.add(tree);
  }

  const centerLabel = document.createElement('div');
  centerLabel.className = 'island-label';
  centerLabel.textContent = '睡前怪獸';
  centerLabel.style.pointerEvents = 'none';
  labelLayer.appendChild(centerLabel);
  centerIsland.userData = { islandId: 'center', labelEl: centerLabel };
  islandGroup.add(centerIsland);

  data.islands.forEach((island, index) => {
    const islandObj = createIslandMarker(island, index);
    islandObj.userData.labelEl = labelLayer.querySelectorAll('.island-label')[labelLayer.querySelectorAll('.island-label').length - 1];
  });
  addPeople();
  setDayPhase(sceneState.dayPhase);
  updateTheme(sceneState.theme);
  bindInteractions();
  updateClock();
  setInterval(updateClock, 10000);
}

function bindInteractions() {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const onPointerDown = (event) => {
    dragState.active = true;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(islandGroup.children, true);
    const hit = intersects.find((entry) => entry.object.parent && entry.object.parent.userData.islandId);
    if (hit && hit.object.parent.userData.islandId) {
      openIsland(hit.object.parent.userData.islandId, true);
    }
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!dragState.active) return;
    const dx = event.clientX - dragState.lastX;
    const dy = event.clientY - dragState.lastY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    cameraState.yaw -= dx * 0.005;
    cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch - dy * 0.004, -1.1, 1.1);
    updateCamera();
  });
  renderer.domElement.addEventListener('pointerup', () => {
    dragState.active = false;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    dragState.active = false;
  });
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraState.distance = THREE.MathUtils.clamp(cameraState.distance * (event.deltaY > 0 ? 1.08 : 0.92), 10, 38);
    updateCamera();
  }, { passive: false });

  document.getElementById('closePanel').addEventListener('click', () => {
    islandPanel.classList.add('hidden');
    sceneState.activeIslandId = null;
  });

  document.getElementById('closeList').addEventListener('click', () => listPanel.classList.add('hidden'));
  document.getElementById('toggleList').addEventListener('click', () => {
    listPanel.classList.toggle('hidden');
  });

  document.getElementById('resetView').addEventListener('click', () => {
    cameraState.distance = 24;
    cameraState.yaw = 0.7;
    cameraState.pitch = 0.52;
    cameraState.target.set(0, 1.5, 0);
    updateCamera();
  });

  document.getElementById('toggleDayNight').addEventListener('click', () => {
    const order = ['day', 'dusk', 'night'];
    const nextIndex = (order.indexOf(sceneState.dayPhase) + 1) % order.length;
    setDayPhase(order[nextIndex]);
  });

  document.getElementById('toggleReducedMotion').addEventListener('click', () => {
    sceneState.reducedMotion = !sceneState.reducedMotion;
    localStorage.setItem('sigma-reduced-motion', String(sceneState.reducedMotion));
    document.getElementById('toggleReducedMotion').textContent = sceneState.reducedMotion ? '恢復動畫' : '減少動態';
    if (sceneState.reducedMotion) {
      showToast('動畫已暫停');
    } else {
      showToast('動畫已恢復');
    }
  });

  document.getElementById('shareButton').addEventListener('click', async () => {
    const hash = sceneState.activeIslandId ? `#${sceneState.activeIslandId}` : '#center';
    const shareUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    const shareText = `睡前怪獸｜${sceneState.activeIslandId ? data.islands.find((item) => item.id === sceneState.activeIslandId)?.name || '睡前怪獸' : '睡前怪獸'}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: '睡前怪獸',
          text: shareText,
          url: shareUrl,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showToast('分享連結已複製');
      } else {
        showToast('此瀏覽器不支援分享');
      }
    } catch (error) {
      showToast('分享已取消');
    }
  });

  document.querySelectorAll('.theme-btn').forEach((button) => {
    button.addEventListener('click', () => {
      updateTheme(button.dataset.theme);
      if (button.dataset.theme === 'night') {
        setDayPhase('night');
      }
    });
  });

  searchInput.addEventListener('input', () => {
    renderList();
    const query = searchInput.value.trim();
    if (!query) return;
    const matches = data.islands.filter((island) => `${island.name} ${island.intro} ${island.extra}`.toLowerCase().includes(query.toLowerCase()));
    if (matches.length) {
      openIsland(matches[0].id, false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      islandPanel.classList.add('hidden');
      listPanel.classList.add('hidden');
    }
  });
}

function addPeople() {
  const routes = [
    { start: [-2.6, 0.4, 2.4], end: [2.6, 0.4, 2.4] },
    { start: [0.5, 0.4, -2.6], end: [3.5, 0.4, -1.2] },
    { start: [-3.2, 0.4, -1.3], end: [-0.2, 0.4, 2.8] },
  ];

  routes.forEach((route, index) => {
    const person = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.17, 0.36, 4, 8),
      new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0xffd9a0 : 0x69d0ff })
    );
    body.position.y = 0.5;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xe7c9a4 })
    );
    head.position.y = 0.92;
    person.add(body, head);
    person.position.set(route.start[0], route.start[1], route.start[2]);
    person.userData = { route, t: Math.random() * 100, speed: 0.0007 + index * 0.00018 };
    scene.add(person);
    people.push(person);
  });
}

function animatePeople() {
  if (sceneState.reducedMotion) return;
  people.forEach((person, index) => {
    const { start, end } = person.userData.route;
    const t = (person.userData.t + person.userData.speed) % 1;
    person.userData.t = t;
    person.position.lerpVectors(
      new THREE.Vector3(start[0], start[1], start[2]),
      new THREE.Vector3(end[0], end[1], end[2]),
      t
    );
    person.rotation.y = Math.sin(t * Math.PI * 2) * 0.5;
    if (index % 2 === 0) {
      person.position.y = 0.35 + Math.sin((t + index) * Math.PI * 2) * 0.12;
    }
  });
}

function updateIslandLabels() {
  if (!scene || !labelLayer || !camera) return;
  islandGroup.children.forEach((child) => {
    if (!child.userData.labelEl) return;
    const marker = child.userData.labelEl;
    const pos = child.position.clone().add(new THREE.Vector3(0, 3.4, 0));
    const projected = pos.clone().project(camera);
    const x = (projected.x * 0.5 + 0.5) * sceneContainer.clientWidth;
    const y = (-projected.y * 0.5 + 0.5) * sceneContainer.clientHeight;
    marker.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    const visible = projected.z > -1 && projected.z < 1;
    marker.style.opacity = visible ? '1' : '0';
    marker.style.display = visible ? 'block' : 'none';
  });
}

function updateCamera() {
  const x = cameraState.target.x + Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance;
  const y = cameraState.target.y + Math.sin(cameraState.pitch) * cameraState.distance;
  const z = cameraState.target.z + Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch) * cameraState.distance;
  camera.position.set(x, y, z);
  camera.lookAt(cameraState.target);
}

function render() {
  requestAnimationFrame(render);
  if (scene && camera) {
    updateCamera();
    updateIslandLabels();
    animatePeople();
    renderer.render(scene, camera);
  }
}

async function loadData() {
  const response = await fetch('./data/content.json');
  if (!response.ok) throw new Error('Unable to load content JSON');
  data = await response.json();
  data.islands.forEach((island) => {
    island.category = island.category || '生活感地點';
    island.material = island.material || '示意內容';
  });

  if (hasWebGL && !scene) {
    buildScene();
    render();
  }

  renderList();
  if (data.islands[0]) openIsland(data.islands[0].id, false);
}

function detectWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      hasWebGL = false;
    }
  } catch (error) {
    hasWebGL = false;
  }
}

function initFallback() {
  if (!hasWebGL) {
    fallbackNotice.classList.remove('hidden');
    listPanel.classList.remove('hidden');
    sceneContainer.innerHTML = '';
  }
}

detectWebGL();

if (hasWebGL) {
  loadData().catch((error) => {
    console.error(error);
    showToast('內容資料載入失敗');
  });
} else {
  initFallback();
  loadData().catch((error) => {
    console.error(error);
    showToast('內容資料載入失敗');
  });
}

window.addEventListener('resize', () => {
  if (!scene || !camera || !renderer) return;
  camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
});

window.addEventListener('load', () => {
  const target = document.querySelector('.theme-btn[data-theme="sunrise"]');
  if (target) target.classList.add('active');
});

window.addEventListener('hashchange', () => {
  const id = window.location.hash.replace('#', '');
  if (!id || !data) return;
  const island = data.islands.find((entry) => entry.id === id);
  if (island) {
    openIsland(island.id, false);
  }
});

if (savedTheme) updateTheme(savedTheme);
if (sceneState.reducedMotion) {
  document.getElementById('toggleReducedMotion').textContent = '恢復動畫';
}
