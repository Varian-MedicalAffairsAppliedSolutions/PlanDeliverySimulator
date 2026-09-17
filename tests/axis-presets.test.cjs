// Run with: node --test tests/axis-presets.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../RP_Delivery_Simulator.html'), 'utf8');

function setup() {
    const elements = new Map();
    const element = () => ({ value: '', validity: {}, style: {}, listeners: {},
        appendChild(child) { if (child.id) elements.set(child.id, child); },
        addEventListener(event, callback) { this.listeners[event] = callback; }, click() {}, remove() {} });
    const document = { createElement: element, body: element(), getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    } };
    let savedBlob;
    const context = vm.createContext({ document, Blob, URL: {
        createObjectURL(blob) { savedBlob = blob; return 'blob:test'; }, revokeObjectURL() {}
    }, setTimeout() {}, componentCapabilityChart: null, drawAllXYTimePlots() {},
    COMPONENT_COLORS: {}, isPlaying: false,
    Chart: function(ctx, config) { this.options = config.options; } });
    vm.runInContext(html.slice(html.indexOf('            // Axis presets affect'), html.indexOf('            function drawAllXYTimePlots(')), context);
    vm.runInContext(html.slice(html.indexOf('            function drawComponentCapabilityPlot('), html.indexOf('            function drawSingleRadialPlot(')), context);
    return { context, document, run: code => vm.runInContext(code, context), saved: () => savedBlob };
}

test('all inline scripts parse', () => {
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('validation rejects malformed configs and invalid ranges', () => {
    const { run } = setup();
    for (const config of [null, {}, { version: 2, axes: {} }, { version: 1, axes: [] },
        { version: 1, axes: { unknown: { min: 0, max: 1 } } },
        ...[{ min: 1, max: 1 }, { min: 2, max: 1 }, { min: '0', max: 1 }, { min: 0 }, { min: null, max: 1 }].map(range => ({ version: 1, axes: { time: range } }))]) {
        assert.throws(() => run(`validateAxisPresets(${JSON.stringify(config)})`));
    }
    assert.throws(() => run('validateAxisPresets({ version: 1, axes: { time: { min: -1e308, max: 1e308 } } })'));
});

test('save/load round trip, invalid import preserves settings, and reset restores autoscaling', async () => {
    const { run, document: doc, saved } = setup();
    doc.getElementById('axis-time-min').value = '5';
    doc.getElementById('axis-time-max').value = '40';
    doc.getElementById('axis-gantryAccel-min').value = '-2';
    doc.getElementById('axis-gantryAccel-max').value = '2';
    doc.getElementById('saveAxisPresets').listeners.click();
    const json = await saved().text();
    assert.deepEqual(JSON.parse(json), { version: 1, axes: { time: { min: 5, max: 40 }, gantryAccel: { min: -2, max: 2 } } });
    doc.getElementById('resetAxisPresets').listeners.click();
    assert.equal(run("axisRange('time', 0, 100).max"), 100);
    const file = doc.getElementById('axisPresetFile');
    file.files = [{ name: 'test.json', text: async () => json }];
    await file.listeners.change();
    assert.equal(run("axisRange('time', 0, 100).max"), 40);
    for (const invalid of ['{', '{"version":1,"axes":{"time":{"min":8,"max":2}}}']) {
        file.files = [{ text: async () => invalid }];
        await file.listeners.change();
        assert.equal(run("axisRange('time', 0, 100).max"), 40);
        assert.match(doc.getElementById('axisPresetStatus').textContent, /Could not load/);
    }
    doc.getElementById('axis-time-min').value = '';
    doc.getElementById('applyAxisPresets').listeners.click();
    assert.equal(run("axisRange('time', 0, 100).max"), 40);
    assert.match(doc.getElementById('axisPresetStatus').textContent, /finite bounds/);
});

test('presets reach canvas axes and Chart.js scales', () => {
    const { context, run } = setup();
    const labels = [];
    const canvasContext = new Proxy({ canvas: { clientWidth: 800, clientHeight: 400 },
        fillText(text) { labels.push(text); } }, { get(target, key) { return key in target ? target[key] : () => {}; } });
    context.ctx = canvasContext;
    run("applyAxisPresetConfig({ time: { min: 10, max: 50 }, doseRate: { min: 100, max: 900 }, gantrySpeed: { min: 2, max: 8 }, gantryAccel: { min: -3, max: 3 }, capability: { min: 20, max: 120 } })");
    run("drawSingleYAxisXYPlot(ctx, [{x:0,y:0},{x:60,y:1200}], [], 'Time', 'Dose', 'Dose', 'blue', 'Dose Rate')");
    for (const label of ['10.0', '50.0', '100.0', '900.0']) assert.ok(labels.includes(label), label);
    labels.length = 0;
    run("drawDualYAxisXYPlot(ctx, [{x:0,y:0},{x:60,y:12}], [{x:0,y:-8},{x:60,y:8}], [], 'Time', 'Speed', 'Accel', 'Gantry', 'blue', 'red', 'Gantry')");
    for (const label of ['10.0', '50.0', '2.0', '8.0', '-3.0', '3.0']) assert.ok(labels.includes(label), label);
    run("drawComponentCapabilityPlot(ctx, [{cumulativeSimTime:0}, {cumulativeSimTime:60}], 'Time', 'Capacity', 'Capacity', null)");
    assert.equal(run('componentCapabilityChart.options.scales.x.min'), 10);
    assert.equal(run('componentCapabilityChart.options.scales.x.max'), 50);
    assert.equal(run('componentCapabilityChart.options.scales.y.min'), 20);
    assert.equal(run('componentCapabilityChart.options.scales.y.max'), 120);
});
