/* ── State ── */
let activeLinkLeft = null;
let activeLinkRight = null;

const leftPanel = document.getElementById('sidebar-left');
const leftContent = document.getElementById('left-content');
const leftTitle = document.getElementById('left-title');
const leftClose = document.getElementById('left-close');

const rightPanel = document.getElementById('sidebar-right');
const rightContent = document.getElementById('right-content');
const rightTitle = document.getElementById('right-title');
const rightClose = document.getElementById('right-close');

/* ── Open / close ── */
function openLeft(title) {
  leftPanel.classList.add('open');
  document.body.classList.add('left-open');
  leftTitle.textContent = title || 'Files';
}
function closeLeft() {
  leftPanel.classList.remove('open');
  document.body.classList.remove('left-open');
  if (activeLinkLeft) {
    activeLinkLeft.classList.remove('active');
    activeLinkLeft = null;
  }
}

function openRight(title) {
  rightPanel.classList.add('open');
  document.body.classList.add('right-open');
  rightTitle.textContent = title || 'Chat';
}
function closeRight() {
  rightPanel.classList.remove('open');
  document.body.classList.remove('right-open');
  if (activeLinkRight) {
    activeLinkRight.classList.remove('active');
    activeLinkRight = null;
  }
}

leftClose.addEventListener('click', closeLeft);
rightClose.addEventListener('click', closeRight);

/* ── Link click handler ── */
document.addEventListener('click', function(e) {
  const link = e.target.closest('a[data-sidebar]');
  if (!link) return;
  e.preventDefault();

  const mode = link.dataset.sidebar;

  if (mode === 'tree') {
    if (link === activeLinkLeft) { closeLeft(); return; }
    if (activeLinkLeft) activeLinkLeft.classList.remove('active');
    activeLinkLeft = link;
    link.classList.add('active');
    showTree(link.dataset.highlight);
  } else if (mode === 'chat') {
    if (link === activeLinkRight) { closeRight(); return; }
    if (activeLinkRight) activeLinkRight.classList.remove('active');
    activeLinkRight = link;
    link.classList.add('active');
    showChat(link.dataset.src, link.dataset.msg);
  }
});

/* ── File tree (left) ── */
function showTree(highlightPath) {
  openLeft('Files');

  if (typeof TREE_DATA === 'undefined') {
    leftContent.innerHTML = '<div style="padding:16px;color:#ef4444">tree-data.js not found. Run build.sh first.</div>';
    return;
  }

  leftContent.innerHTML = '';
  renderTree(TREE_DATA, leftContent, highlightPath, true);

  setTimeout(() => {
    const el = leftContent.querySelector('.highlighted');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

function renderTree(node, container, highlightPath, startExpanded) {
  if (node.type === 'dir') {
    const item = document.createElement('div');

    let shouldExpand = startExpanded;
    const isHighlighted = highlightPath && node.path === highlightPath;
    if (highlightPath && (highlightPath.startsWith(node.path + '/') || isHighlighted)) {
      shouldExpand = true;
    }
    if (node.path === '') shouldExpand = true;

    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle' + (shouldExpand ? ' expanded' : '');
    toggle.textContent = '\u25B6';

    const row = document.createElement('div');
    row.className = 'tree-item' + (isHighlighted ? ' highlighted' : '');
    row.style.paddingLeft = '8px';
    row.appendChild(toggle);

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '\u{1F4C1}';
    row.appendChild(icon);

    const name = document.createElement('span');
    name.textContent = node.name;
    row.appendChild(name);

    item.appendChild(row);

    const children = document.createElement('div');
    children.className = 'tree-children' + (shouldExpand ? '' : ' collapsed');

    if (node.children) {
      for (const child of node.children) {
        renderTree(child, children, highlightPath, false);
      }
    }
    item.appendChild(children);

    toggle.addEventListener('click', () => {
      children.classList.toggle('collapsed');
      toggle.classList.toggle('expanded');
    });
    row.addEventListener('click', (e) => {
      if (e.target !== toggle) {
        children.classList.toggle('collapsed');
        toggle.classList.toggle('expanded');
      }
    });

    container.appendChild(item);
  } else {
    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = '28px';

    if (highlightPath && node.path === highlightPath) {
      row.classList.add('highlighted');
    }

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = fileIcon(node.name);
    row.appendChild(icon);

    const name = document.createElement('span');
    name.textContent = node.name;
    row.appendChild(name);

    // Make .jsonl files clickable to open chat viewer on the right
    if (node.name.endsWith('.jsonl')) {
      row.classList.add('tree-clickable');
      row.addEventListener('click', () => {
        showChat(node.path);
      });
    }

    container.appendChild(row);
  }
}

function fileIcon(name) {
  if (name.endsWith('.md')) return '\u{1F4DD}';
  if (name.endsWith('.sh')) return '\u{2699}';
  if (name.endsWith('.json')) return '{}';
  if (name.endsWith('.jsonl')) return '\u{1F4AC}';
  if (name.endsWith('.html')) return '\u{1F310}';
  if (name.endsWith('.png') || name.endsWith('.jpg')) return '\u{1F5BC}';
  if (name.endsWith('.txt')) return '\u{1F4C4}';
  return '\u{1F4C4}';
}

/* ── Chat viewer (right) ── */
function showChat(src, msgUuid) {
  openRight(src || 'Chat');

  if (typeof CHAT_DATA === 'undefined') {
    rightContent.innerHTML = '<div style="padding:16px;color:#ef4444">chat-data.js not found. Run build.sh first.</div>';
    return;
  }

  if (!src || !CHAT_DATA[src]) {
    rightContent.innerHTML = '<div style="padding:16px;color:#ef4444">No chat data for: ' + (src || '(none)') + '</div>';
    return;
  }

  renderChat(CHAT_DATA[src], msgUuid);
}

function renderChat(messages, highlightUuid) {
  rightContent.innerHTML = '';

  for (const msg of messages) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg';
    wrapper.id = 'msg-' + msg.uuid;

    if (highlightUuid && msg.uuid === highlightUuid) {
      wrapper.classList.add('highlighted');
    }

    const role = document.createElement('div');
    role.className = 'chat-role ' + msg.role;
    role.textContent = msg.role === 'user' ? 'Daniel' : 'Claude';
    wrapper.appendChild(role);

    const textEl = document.createElement('div');
    textEl.className = 'chat-text';

    const isLong = msg.text.length > 600;
    if (isLong) {
      textEl.classList.add('chat-truncated');
    }
    textEl.textContent = msg.text;
    wrapper.appendChild(textEl);

    if (isLong) {
      const showMore = document.createElement('span');
      showMore.className = 'chat-show-more';
      showMore.textContent = 'Show more...';
      showMore.addEventListener('click', () => {
        textEl.classList.toggle('chat-truncated');
        showMore.textContent = textEl.classList.contains('chat-truncated') ? 'Show more...' : 'Show less';
      });
      wrapper.appendChild(showMore);
    }

    rightContent.appendChild(wrapper);
  }

  if (highlightUuid) {
    setTimeout(() => {
      const el = document.getElementById('msg-' + highlightUuid);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }
}
