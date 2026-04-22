const stages = [
  { code: 'JOB_CLASSIFICATION', name: '岗位分类' },
  { code: 'JD_REWRITE', name: 'JD清洗' },
  { code: 'RESUME_PRESCREEN', name: '简历初筛' },
  { code: 'RESUME_SCORING', name: '简历精细算分' },
];

const dimensions = [
  { key: 'biz_line', name: '业务线' },
  { key: 'department', name: '部门' },
  { key: 'city', name: '城市' },
  { key: 'job_family', name: '岗位族群' },
  { key: 'level', name: '职级' },
];

const bizLines = ['技术线', '销售线', '职能线'];
const departments = ['研发部', '产品部', '销售一部', 'HRBP'];
const models = ['gpt-4.1', 'gpt-4o-mini', 'claude-3.7'];
const prompts = ['v1-技术岗初筛', 'v2-销售岗初筛', 'v1-JD清洗通用'];

let strategies = [
  {
    id: 1,
    name: '技术线-研发部-简历初筛',
    stage: 'RESUME_PRESCREEN',
    conditions: { biz_line: '技术线', department: '研发部' },
    model: 'gpt-4.1',
    prompt: 'v1-技术岗初筛',
    priority: 1,
    status: 'enabled',
  },
  {
    id: 2,
    name: '技术线-通用-简历初筛',
    stage: 'RESUME_PRESCREEN',
    conditions: { biz_line: '技术线' },
    model: 'gpt-4o-mini',
    prompt: 'v1-技术岗初筛',
    priority: 10,
    status: 'enabled',
  },
];

let editId = null;

const ui = {
  table: document.querySelector('#strategyTable'),
  stageFilter: document.querySelector('#stageFilter'),
  bizFilter: document.querySelector('#bizFilter'),
  keyword: document.querySelector('#keyword'),
  form: document.querySelector('#strategyForm'),
  formTitle: document.querySelector('#formTitle'),
  stageSelect: document.querySelector('#stageSelect'),
  bizSelect: document.querySelector('#bizSelect'),
  deptSelect: document.querySelector('#deptSelect'),
  modelSelect: document.querySelector('#modelSelect'),
  promptSelect: document.querySelector('#promptSelect'),
  newBtn: document.querySelector('#newBtn'),
  advancedToggle: document.querySelector('#advancedToggle'),
  advancedArea: document.querySelector('#advancedArea'),
  addDimensionBtn: document.querySelector('#addDimensionBtn'),
  dimensionRows: document.querySelector('#dimensionRows'),
  result: document.querySelector('#result'),
  testBtn: document.querySelector('#testBtn'),
};

function populateSelect(el, options, { allLabel = null, emptyLabel = null } = {}) {
  const html = [];
  if (allLabel) html.push(`<option value="">${allLabel}</option>`);
  if (emptyLabel !== null) html.push(`<option value="">${emptyLabel}</option>`);
  options.forEach((opt) => {
    if (typeof opt === 'string') html.push(`<option value="${opt}">${opt}</option>`);
    else html.push(`<option value="${opt.code}">${opt.name}</option>`);
  });
  el.innerHTML = html.join('');
}

function stageName(code) {
  return stages.find((s) => s.code === code)?.name || code;
}

function renderTable() {
  const sf = ui.stageFilter.value;
  const bf = ui.bizFilter.value;
  const kw = ui.keyword.value.trim();

  const filtered = strategies.filter((s) => {
    if (sf && s.stage !== sf) return false;
    if (bf && s.conditions.biz_line !== bf) return false;
    if (kw && !s.name.includes(kw)) return false;
    return true;
  });

  ui.table.innerHTML = filtered
    .sort((a, b) => a.priority - b.priority)
    .map(
      (s) => `<tr>
      <td>${s.name}</td>
      <td>${stageName(s.stage)}</td>
      <td>${Object.entries(s.conditions)
        .map(([k, v]) => `${k}: ${v}`)
        .join('<br/>')}</td>
      <td>${s.model}</td>
      <td>${s.prompt}</td>
      <td><span class="badge ${s.status}">${s.status === 'enabled' ? '启用' : '停用'}</span></td>
      <td>${s.priority}</td>
      <td>
        <button onclick="onEdit(${s.id})">编辑</button>
      </td>
    </tr>`
    )
    .join('');
}

function newDimensionRow(key = '', value = '') {
  const tpl = document.querySelector('#dimensionTemplate').content.cloneNode(true);
  const row = tpl.querySelector('.dimension-row');
  const keySelect = row.querySelector('.dim-key');
  const valueInput = row.querySelector('.dim-value');
  keySelect.innerHTML = `<option value="">选择维度</option>${dimensions
    .filter((d) => !['biz_line', 'department'].includes(d.key))
    .map((d) => `<option value="${d.key}">${d.name}</option>`)
    .join('')}`;
  keySelect.value = key;
  valueInput.value = value;
  row.querySelector('.remove').onclick = () => row.remove();
  ui.dimensionRows.appendChild(row);
}

function resetForm() {
  editId = null;
  ui.form.reset();
  ui.formTitle.textContent = '新建策略';
  ui.dimensionRows.innerHTML = '';
  ui.result.textContent = '提示：点击“测试匹配”可预览当前配置在运行时命中的策略。';
}

window.onEdit = function onEdit(id) {
  const s = strategies.find((item) => item.id === id);
  if (!s) return;
  editId = s.id;
  ui.formTitle.textContent = `编辑策略 #${id}`;
  ui.form.name.value = s.name;
  ui.form.stage.value = s.stage;
  ui.form.bizLine.value = s.conditions.biz_line || '';
  ui.form.department.value = s.conditions.department || '';
  ui.form.model.value = s.model;
  ui.form.prompt.value = s.prompt;
  ui.form.priority.value = s.priority;
  ui.form.status.value = s.status;
  ui.dimensionRows.innerHTML = '';
  Object.entries(s.conditions)
    .filter(([k]) => !['biz_line', 'department'].includes(k))
    .forEach(([k, v]) => newDimensionRow(k, v));
};

function buildConditions(formData) {
  const result = {
    biz_line: formData.get('bizLine'),
  };
  if (formData.get('department')) result.department = formData.get('department');

  const rows = [...ui.dimensionRows.querySelectorAll('.dimension-row')];
  rows.forEach((row) => {
    const key = row.querySelector('.dim-key').value;
    const value = row.querySelector('.dim-value').value.trim();
    if (key && value) result[key] = value;
  });
  return result;
}

function resolveStrategy({ stage, ctx }) {
  const candidates = strategies.filter((s) => {
    if (s.status !== 'enabled') return false;
    if (s.stage !== stage) return false;
    return Object.entries(s.conditions).every(([k, v]) => ctx[k] === v);
  });

  candidates.sort((a, b) => {
    const sa = Object.keys(a.conditions).length;
    const sb = Object.keys(b.conditions).length;
    if (sa !== sb) return sb - sa;
    return a.priority - b.priority;
  });
  return candidates[0] || null;
}

ui.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(ui.form);
  const item = {
    id: editId || Date.now(),
    name: fd.get('name').trim(),
    stage: fd.get('stage'),
    conditions: buildConditions(fd),
    model: fd.get('model'),
    prompt: fd.get('prompt'),
    priority: Number(fd.get('priority')),
    status: fd.get('status'),
  };

  const dup = strategies.find(
    (s) =>
      s.id !== item.id &&
      s.status === 'enabled' &&
      item.status === 'enabled' &&
      s.stage === item.stage &&
      JSON.stringify(s.conditions) === JSON.stringify(item.conditions) &&
      s.priority === item.priority
  );
  if (dup) {
    ui.result.textContent = '保存失败：存在相同场景且同优先级的启用策略，请调整优先级或停用其一。';
    return;
  }

  if (editId) strategies = strategies.map((s) => (s.id === item.id ? item : s));
  else strategies.push(item);

  renderTable();
  ui.result.textContent = `保存成功：${item.name}`;
  resetForm();
});

ui.newBtn.addEventListener('click', resetForm);
ui.advancedToggle.addEventListener('change', () => {
  ui.advancedArea.classList.toggle('hidden', !ui.advancedToggle.checked);
});
ui.addDimensionBtn.addEventListener('click', () => newDimensionRow());
ui.testBtn.addEventListener('click', () => {
  const fd = new FormData(ui.form);
  const stage = fd.get('stage');
  const ctx = buildConditions(fd);
  const hit = resolveStrategy({ stage, ctx });
  ui.result.textContent = hit
    ? `测试命中策略：\n- 名称：${hit.name}\n- 模型：${hit.model}\n- 提示词：${hit.prompt}\n- 条件数：${Object.keys(hit.conditions).length}`
    : '测试结果：未命中策略（系统应告警，避免错误调用）。';
});

[ui.stageFilter, ui.bizFilter, ui.keyword].forEach((el) => el.addEventListener('input', renderTable));

(function init() {
  populateSelect(ui.stageFilter, stages, { allLabel: '全部流程节点' });
  populateSelect(ui.bizFilter, bizLines, { allLabel: '全部业务线' });
  populateSelect(ui.stageSelect, stages);
  populateSelect(ui.bizSelect, bizLines);
  populateSelect(ui.deptSelect, departments, { emptyLabel: '（通用，不限制部门）' });
  populateSelect(ui.modelSelect, models);
  populateSelect(ui.promptSelect, prompts);
  resetForm();
  renderTable();
})();
