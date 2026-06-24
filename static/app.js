(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const numberBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  const intro = $('#intro');
  const calculator = $('#calculator');
  const loading = $('#loading');
  const results = $('#results');
  const form = $('#roiForm');
  const steps = $$('.step');
  const nextButton = $('#nextButton');
  const backButton = $('#backButton');
  const progressBar = $('#progressBar');
  const stepLabel = $('#stepLabel');
  const wizardTitle = $('#wizardTitle');
  const formError = $('#formError');
  let currentStep = 0;

  function parseMoney(value) {
    const text = String(value || '').trim().replace(/R\$\s?/g, '').replace(/\s/g, '');
    if (!text) return 0;
    if (text.includes(',')) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
    return Number(text.replace(/[^0-9.-]/g, '')) || 0;
  }

  function formatMoneyInput(input) {
    const value = parseMoney(input.value);
    input.value = value ? currency.format(value) : '';
  }

  function showSection(section) {
    [intro, calculator, loading, results].forEach(el => el.hidden = el !== section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateStep() {
    steps.forEach((step, index) => step.classList.toggle('active', index === currentStep));
    const pct = ((currentStep + 1) / steps.length) * 100;
    progressBar.style.width = `${pct}%`;
    stepLabel.textContent = `ETAPA ${currentStep + 1} DE ${steps.length}`;
    wizardTitle.textContent = steps[currentStep].dataset.title;
    backButton.disabled = currentStep === 0;
    nextButton.innerHTML = currentStep === steps.length - 1 ? 'Gerar meu diagnóstico <span>→</span>' : 'Continuar <span>→</span>';
    formError.hidden = true;
    if (currentStep === 8) buildReview();
  }

  function fieldValid(field) {
    field.classList.remove('invalid');
    if (field.type === 'checkbox') return field.checked;
    if (field.classList.contains('money-input')) return parseMoney(field.value) > 0 || !field.required;
    return field.checkValidity();
  }

  function validateStep() {
    const active = steps[currentStep];
    const fields = $$('input[required]', active).filter(el => !el.closest('[hidden]'));
    let valid = true;
    fields.forEach(field => {
      if (!fieldValid(field)) {
        valid = false;
        field.classList.add('invalid');
      }
    });

    if (currentStep === 4 && parseMoney($('#adBudget').value) < 0) valid = false;
    if (currentStep === 5 && parseMoney($('#serviceCost').value) < 0) valid = false;
    if (currentStep === 7 && $('input[name="knows_cpl"]:checked').value === 'yes' && parseMoney($('#cpl').value) <= 0) {
      $('#cpl').classList.add('invalid');
      valid = false;
    }

    if (!valid) {
      formError.textContent = 'Confira os campos destacados antes de continuar.';
      formError.hidden = false;
    }
    return valid;
  }

  function getData() {
    const model = $('input[name="revenue_model"]:checked').value;
    const knowsCpl = $('input[name="knows_cpl"]:checked').value === 'yes';
    return {
      business_name: $('#businessName').value.trim(),
      segment: $('#segment').value.trim(),
      revenue_model: model,
      average_ticket: parseMoney($('#averageTicket').value),
      retention_months: model === 'recurring' ? Number($('#retentionMonths').value || 1) : 1,
      gross_margin_pct: Number($('#grossMargin').value),
      ad_budget: parseMoney($('#adBudget').value),
      service_cost: parseMoney($('#serviceCost').value),
      extra_costs: parseMoney($('#extraCosts').value),
      close_rate_pct: Number($('#closeRate').value),
      cpl: knowsCpl ? parseMoney($('#cpl').value) : null,
      contact: {
        name: $('#contactName').value.trim(),
        phone: $('#contactPhone').value.trim(),
        email: $('#contactEmail').value.trim(),
        consent: $('#consent').checked
      }
    };
  }

  function buildReview() {
    const d = getData();
    const recurringText = d.revenue_model === 'recurring' ? `${currency.format(d.average_ticket)}/mês por ${d.retention_months} meses` : currency.format(d.average_ticket);
    const items = [
      ['Empresa', d.business_name], ['Segmento', d.segment], ['Valor por cliente', recurringText],
      ['Margem', `${d.gross_margin_pct}%`], ['Anúncios', currency.format(d.ad_budget)],
      ['Operação', currency.format(d.service_cost + d.extra_costs)], ['Conversão', `${d.close_rate_pct}%`],
      ['CPL informado', d.cpl ? currency.format(d.cpl) : 'Não informado']
    ];
    $('#reviewBox').innerHTML = items.map(([label, value]) => `<div class="review-item"><small>${label}</small><strong>${value}</strong></div>`).join('');
  }

  async function submitCalculator() {
    showSection(loading);
    try {
      const response = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getData())
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Não foi possível calcular.');
      renderResults(payload);
      showSection(results);
    } catch (error) {
      showSection(calculator);
      formError.textContent = error.message;
      formError.hidden = false;
    }
  }

  function renderResults(payload) {
    const { result, analysis } = payload;
    const m = result.metrics;
    $('#resultTitle').textContent = `O mapa financeiro de ${result.input.business_name}`;
    $('#resultSummary').textContent = analysis.summary;
    $('#resultVerdict').textContent = analysis.verdict;
    $('#metricInvestment').textContent = currency.format(m.total_investment);
    $('#metricCustomers').textContent = numberBR.format(m.break_even_customers);
    $('#metricLeads').textContent = numberBR.format(m.required_leads);
    $('#metricMaxCpl').textContent = currency.format(m.max_media_cpl);
    $('#insightsList').innerHTML = analysis.insights.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    $('#nextStepsList').innerHTML = analysis.next_steps.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    $('#resultDisclaimer').textContent = analysis.disclaimer;

    const forecastArea = $('#forecastArea');
    forecastArea.hidden = result.scenarios.length === 0;
    if (result.scenarios.length) {
      $('#scenarioGrid').innerHTML = result.scenarios.map((s, i) => {
        const roiClass = s.roi_pct >= 0 ? 'positive' : 'negative';
        return `<article class="scenario-card ${i === 1 ? 'probable' : ''}">
          <div class="scenario-name"><span>${s.name}</span>${i === 1 ? '<span class="scenario-tag">BASE INFORMADA</span>' : ''}</div>
          <div class="scenario-roi"><small>ROI estimado</small><strong class="${roiClass}">${numberBR.format(s.roi_pct)}%</strong></div>
          <div class="scenario-details">
            <div><span>Clientes</span><strong>${numberBR.format(s.customers)}</strong></div>
            <div><span>Faturamento</span><strong>${currency.format(s.revenue)}</strong></div>
            <div><span>CPL</span><strong>${currency.format(s.cpl)}</strong></div>
            <div><span>ROAS</span><strong>${s.roas == null ? '—' : `${numberBR.format(s.roas)}x`}</strong></div>
          </div>
        </article>`;
      }).join('');
    }

    const message = `Olá! Usei a Calculadora de ROI da Verticale para ${result.input.business_name}. Meu investimento total é ${currency.format(m.total_investment)} e o ponto de equilíbrio calculado foi de ${m.break_even_customers} clientes. Gostaria de ajuda para analisar esse cenário.`;
    $('#whatsappCta').href = `https://wa.me/${window.APP_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function resetAll() {
    form.reset();
    currentStep = 0;
    $('#grossMargin').value = 50;
    $('#closeRate').value = 20;
    $$('#conversionPicker button').forEach(btn => btn.classList.toggle('selected', btn.dataset.value === '20'));
    updateMargin();
    updateRevenueModel();
    updateCplMode();
    updateStep();
    showSection(intro);
  }

  function updateMargin() {
    const pct = Number($('#grossMargin').value);
    $('#grossMarginOutput').textContent = `${pct}%`;
    $('#marginHintValue').textContent = `${pct}%`;
    $('#marginHintMoney').textContent = currency.format(1000 * pct / 100);
  }

  function updateRevenueModel() {
    const recurring = $('input[name="revenue_model"]:checked').value === 'recurring';
    $('#retentionGroup').hidden = !recurring;
    $('#ticketQuestion').textContent = recurring ? 'Qual é a mensalidade média paga por um cliente?' : 'Qual é o valor médio de uma venda?';
    $('#ticketHelp').textContent = recurring ? 'Depois vamos multiplicar pelo tempo médio de permanência.' : 'Use a média real. Não escolha apenas o produto mais caro.';
  }

  function updateCplMode() {
    const knows = $('input[name="knows_cpl"]:checked').value === 'yes';
    $('#cplGroup').hidden = !knows;
  }

  $('#startButton').addEventListener('click', () => showSection(calculator));
  $('#exitButton').addEventListener('click', resetAll);
  $('#restartResults').addEventListener('click', resetAll);
  nextButton.addEventListener('click', () => {
    if (!validateStep()) return;
    if (currentStep < steps.length - 1) {
      currentStep += 1;
      updateStep();
      window.scrollTo({ top: calculator.offsetTop - 10, behavior: 'smooth' });
    } else {
      submitCalculator();
    }
  });
  backButton.addEventListener('click', () => {
    if (currentStep > 0) currentStep -= 1;
    updateStep();
  });

  $$('.money-input').forEach(input => {
    input.addEventListener('focus', () => { input.value = parseMoney(input.value) || ''; });
    input.addEventListener('blur', () => formatMoneyInput(input));
    input.addEventListener('input', () => input.classList.remove('invalid'));
  });
  $$('input[name="revenue_model"]').forEach(input => input.addEventListener('change', updateRevenueModel));
  $$('input[name="knows_cpl"]').forEach(input => input.addEventListener('change', updateCplMode));
  $('#grossMargin').addEventListener('input', updateMargin);
  $$('#conversionPicker button').forEach(button => button.addEventListener('click', () => {
    $$('#conversionPicker button').forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');
    const value = Number(button.dataset.value);
    $('#closeRate').value = value;
    $('#conversionText').textContent = `${value / 10} em cada 10`;
    $('#conversionPercent').textContent = `${value}%`;
  }));
  $('#contactPhone').addEventListener('input', event => {
    let digits = event.target.value.replace(/\D/g, '').slice(0, 11);
    if (digits.length > 6) digits = `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    else if (digits.length > 2) digits = `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    event.target.value = digits;
  });
  $$('input').forEach(input => input.addEventListener('input', () => input.classList.remove('invalid')));

  updateStep();
  updateMargin();
})();
