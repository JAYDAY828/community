(function(){
  'use strict';
  const C=SettlementCore;
  let inFlight=null,prepared=null,withdrawalState=null,withdrawalEpoch=0;
  let host,bridge,report=null,epoch=0,year=new Date(Date.now()+9*3600000).getUTCFullYear(),month=new Date(Date.now()+9*3600000).getUTCMonth()+1,mode='calendar',scope='monthly',page=1,day='',editing=null,busy=false;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const $=id=>host.querySelector('#settlement-'+id);
  const plan=p=>bridge?.plan(p)||p;
  const money=v=>`${v} USDT`;
  function notice(text){$('message').textContent=text;}
  function permitted(){return bridge&&bridge.profile()?.grade==='admin';}
  function reset(){epoch++;withdrawalEpoch++;withdrawalState=null;report=null;prepared=null;day='';page=1;editing=null;busy=false;inFlight=null;if(host){host.replaceChildren();host=null;}}
  function mount(){
    host=document.getElementById('member-admin-settlement-view');
    host.innerHTML=`<div class="settlement-heading"><div><h4>정산 내역</h4><p class="settlement-help">입금일 / 출금 기록일 · KST · USDT</p></div><span id="settlement-count" class="settlement-count"></span></div>
    <div class="settlement-controls"><div class="settlement-period-controls"><label class="settlement-sr-only" for="settlement-scope">조회 단위</label><select id="settlement-scope"><option value="monthly">월간</option><option value="annual">연간</option></select><label class="settlement-sr-only" for="settlement-year">연도</label><select id="settlement-year"></select><label id="settlement-month-label"><span class="settlement-sr-only">월</span><select id="settlement-month"></select></label></div><div class="settlement-actions"><button id="settlement-withdrawals-open" type="button" class="liquid-btn-smoke">출금 내역</button><button id="settlement-refresh" type="button" class="liquid-btn-smoke">새로고침</button><button id="settlement-export" class="liquid-btn-smoke" type="button" disabled>Excel 내보내기</button></div></div>
    <section id="settlement-withdrawals" class="settlement-withdrawals" hidden aria-label="출금 기록 관리">
      <div class="settlement-heading"><div><h4>출금 기록 관리</h4><p class="settlement-help">완료된 USDT 출금을 분류해 기록합니다. 실제 송금 기능은 없습니다.</p></div><button id="settlement-w-close" type="button" class="liquid-btn-smoke">닫기</button></div>
      <div class="settlement-toolbar"><button id="settlement-w-fetch" type="button" class="liquid-btn-white">OKX 출금 불러오기</button><button id="settlement-w-saved" type="button" class="liquid-btn-smoke">저장된 기록</button></div>
      <p id="settlement-w-message" role="status" class="settlement-help"></p>
      <div class="settlement-withdrawal-workspace"><div><div id="settlement-w-items" class="settlement-withdrawal-items"></div><div class="settlement-pagination"><button id="settlement-w-prev" type="button" class="liquid-btn-smoke">이전</button><span id="settlement-w-page"></span><button id="settlement-w-next" type="button" class="liquid-btn-smoke">다음</button></div><button id="settlement-w-more" type="button" class="liquid-btn-smoke" hidden>이전 출금 더 불러오기</button></div>
      <form id="settlement-w-form" class="settlement-adjust" hidden>
        <h4 id="settlement-w-title"></h4><p id="settlement-w-evidence" class="settlement-help"></p>
        <label>기록 분류<select id="settlement-w-kind" required><option value="">분류를 선택하세요</option><option value="owner_withdrawal">본인 인출</option><option value="refund">고객 환불</option><option value="excluded">테스트 · 정산 제외</option></select></label>
        <label id="settlement-w-receipt-label">환불할 결제<select id="settlement-w-receipt"></select></label>
        <label>기존 기록 연결<select id="settlement-w-link"></select><span class="settlement-help">이미 기록한 환불·인출이라면 해당 기록을 선택하세요. 중복 차감 없이 출금 증빙을 연결합니다.</span></label>
        <label>기록·정정 사유<textarea id="settlement-w-reason" maxlength="500" required></textarea></label>
        <label>마스터 시리얼 재확인<input id="settlement-w-serial" type="password" autocomplete="off" required></label>
        <button id="settlement-w-save" type="submit" class="liquid-btn-white">기록 저장</button><p id="settlement-w-result" role="status" class="settlement-help"></p>
      </form></div><p class="settlement-help">OKX 출금은 완료 상태의 요청 시각(KST)으로 기록됩니다. API에서 제공하는 내역만 조회하며, 과거 전체 내역을 보장하지 않습니다. 정산 제외 건은 원금·수수료 모두 합계에서 제외하고 이력에 보존합니다.</p>
    </section><p id="settlement-message" role="status" class="settlement-help settlement-status"></p><div id="settlement-summary" class="settlement-summary"></div>
    <details id="settlement-costs" class="settlement-disclosure settlement-cashflow"><summary>자금 흐름</summary><div id="settlement-cost-details"></div></details>
    <div class="settlement-viewbar"><h4 id="settlement-period-title"></h4><div id="settlement-modes" class="settlement-modes" role="group" aria-label="정산 보기"><button data-mode="calendar" type="button">달력</button><button data-mode="list" type="button">거래 목록</button></div></div>
    <div id="settlement-workspace" class="settlement-workspace"><section id="settlement-calendar-panel" class="settlement-calendar-panel" aria-label="일별 정산 달력"><div class="settlement-calendar-legend">일별 순수납 · USDT</div><div id="settlement-calendar" class="settlement-calendar"></div><p class="settlement-help">금액은 요약 표시입니다. 날짜를 선택하면 정확한 금액을 확인할 수 있습니다.</p></section><section id="settlement-annual" hidden></section><section id="settlement-list" aria-label="거래 목록"></section></div>
    <details id="settlement-plan-panel" class="settlement-disclosure"><summary>플랜별 집계</summary><div id="settlement-breakdown"></div></details>
    <details id="settlement-exceptions"><summary>미확인·무료 이용권</summary><p class="settlement-help">선택 연도 승인 기록 및 승인일 미확인 기록입니다. 월 필터와 별도로 표시하며 합계에 포함하지 않습니다.</p><div id="settlement-exception-list"></div></details>
    <form id="settlement-adjust" hidden class="settlement-adjust"><h4 id="settlement-adjust-title"></h4><p class="settlement-help">실제 송금 기능이 아닙니다. 이미 처리한 환불이나 증빙에 따른 정정만 기록하세요.</p>
    <label>기록 유형<select id="settlement-kind"><option value="refund">환불 기록</option><option value="refund_reversal">환불 기록 정정 (+)</option><option value="receipt_date">과거 입금일 보완</option></select></label>
    <label id="settlement-amount-label">금액 USDT<input id="settlement-amount" inputmode="decimal" type="text" autocomplete="off"></label>
    <label>발생 시각 (KST)<input id="settlement-occurred" type="datetime-local" step="1" required></label>
    <label>거래 TXID 또는 증빙 참조<input id="settlement-evidence" maxlength="300" required></label><label>사유<textarea id="settlement-reason" maxlength="500" required></textarea></label>
    <label>마스터 시리얼 재확인<input id="settlement-serial" type="password" autocomplete="off" required></label><div class="settlement-toolbar"><button type="submit" id="settlement-save" class="liquid-btn-white">기록 저장</button><button type="button" id="settlement-cancel" class="liquid-btn-smoke">닫기</button></div><p id="settlement-adjust-message" role="status"></p></form>`;
    for(let y=year;y>=2020;y--)$('year').add(new Option(String(y),String(y)));
    for(let m=1;m<=12;m++)$('month').add(new Option(`${m}월`,String(m)));
    $('month').value=month;$('scope').value=scope;
    $('year').onchange=()=>{if(busy)return;year=Number($('year').value);day='';page=1;closeEditor();load();};
    $('month').onchange=()=>{month=Number($('month').value);day='';page=1;closeEditor();render();};
    $('scope').onchange=()=>{if(busy)return;scope=$('scope').value;day='';page=1;closeEditor();render();};
    $('refresh').onclick=load;
    $('withdrawals-open').onclick=()=>openWithdrawals();$('w-close').onclick=closeWithdrawals;
    $('w-fetch').onclick=()=>fetchWithdrawals(false);$('w-saved').onclick=()=>fetchWithdrawals(true);$('w-more').onclick=()=>fetchWithdrawals(false,true);
    $('w-prev').onclick=()=>{withdrawalState.page--;renderWithdrawals();};$('w-next').onclick=()=>{withdrawalState.page++;renderWithdrawals();};
    $('w-kind').onchange=()=>{$('w-receipt-label').hidden=$('w-kind').value!=='refund';$('w-receipt').required=$('w-kind').value==='refund';};$('w-form').onsubmit=saveWithdrawal;
    $('w-link').onchange=()=>{const link=withdrawalState.links.find(l=>l.eventId===$('w-link').value);if(link?.type==='refund'){$('w-kind').value='refund';$('w-receipt').value=link.requestId;$('w-kind').onchange();}};
    $('modes').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;if(busy)return;mode=b.dataset.mode;day='';page=1;closeEditor();render();};
    $('export').onclick=()=>{if(!report||!permitted())return;try{const data=C.xlsx(C.sheets(report,scope==='annual'?0:month,plan));const blob=new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`정산_${year}${scope==='annual'?'':'-'+String(month).padStart(2,'0')}_KST.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){notice(e.message);}};
    $('kind').onchange=()=>{$('amount-label').hidden=$('kind').value==='receipt_date';$('amount').required=$('kind').value!=='receipt_date';};
    $('cancel').onclick=closeEditor;$('adjust').onsubmit=save;
  }
  function load(){
    if(busy||!permitted())return Promise.resolve();
    if(inFlight)return inFlight.promise;
    const job={year,token:bridge.token(),generation:bridge.generation(),promise:null};
    inFlight=job;$('refresh').disabled=true;
    job.promise=performLoad(job.year).finally(()=>{
      if(inFlight!==job)return;
      inFlight=null;if(!host)return;$('refresh').disabled=busy;
      // A year change while waiting queues only the latest selected year.
      if(year!==job.year && job.token===bridge.token() && job.generation===bridge.generation())return load();
    });
    return job.promise;
  }
  async function performLoad(requestedYear){
    if(busy||!permitted())return;const current=++epoch,token=bridge.token(),generation=bridge.generation();report=null;prepared=null;closeEditor();render();notice('정산 기록을 불러오는 중…');$('export').disabled=true;
    try{const result=await bridge.api('admin_settlement',{token,year:String(requestedYear)});
      if(current!==epoch||token!==bridge.token()||generation!==bridge.generation()||!permitted())return;
      if(year!==requestedYear)return;
      if(!result.ok)throw Error(result.error==='unknown_action'?'Apps Script에 정산 패치를 배포한 뒤 다시 조회해 주세요.':`정산 조회 실패: ${result.error}`);
      prepared=C.prepare(result);report=result;for(const y of result.years)if(![...$('year').options].some(o=>o.value===y))$('year').add(new Option(y,y));render();
      const unresolved=result.exceptions.filter(r=>r.kind==='receipt'&&!r.day);
      const linked=result.recovery?.recovered?` · 기존 입금 ${result.recovery.recovered}건 연결`:'';
      const undatedAmount=C.amount(unresolved.reduce((sum,r)=>sum+C.units(r.amount),0));
      notice(`조회 시각 ${C.kst(result.generatedAt)}${linked}${unresolved.length?` · 입금 확인 ${unresolved.length}건 (${undatedAmount} USDT)은 입금일 미확인으로 합계에서 제외되었습니다. 아래 기록에서 확인해 주세요.`:''}${result.recovery?.pending?` · 다음 조회에서 연결할 기록 ${result.recovery.pending}건`:''}`);
      if(unresolved.length)$('exceptions').open=true;
      if(result.recovery?.deferred)$('message').textContent+=` · 재시도 대기 ${result.recovery.deferred}건`;
    }catch(e){if(current===epoch&&host){notice(e.message||'정산 조회에 실패했습니다.');}}
  }
  function table(headers,rows){const wrap=el('div',undefined,'settlement-table-wrap'),t=el('table');const head=el('tr');headers.forEach(v=>head.append(el('th',v)));const thead=el('thead');thead.append(head);t.append(thead);const body=el('tbody');rows.forEach(row=>{const tr=el('tr');row.forEach(v=>tr.append(el('td',v)));body.append(tr);});t.append(body);wrap.append(t);return wrap;}
  function compact(value){
    const n=Number(value),abs=Math.abs(n);
    if(abs>=1000000)return `${(n/1000000).toFixed(1).replace(/\.0$/,'')}M`;
    if(abs>=1000)return `${(n/1000).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}K`;
    return abs&&abs<.01?(n<0?'≈−0':'≈0'):n.toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1')||'0';
  }
  function render(){
    if(!host)return;
    for(const id of ['summary','calendar','annual','breakdown','list','exception-list','cost-details'])$(id).replaceChildren();
    const annual=scope==='annual',calendar=!annual&&mode==='calendar';
    $('month-label').hidden=annual;$('calendar-panel').hidden=!calendar;$('annual').hidden=!annual||mode==='list';
    $('modes').querySelector('[data-mode="calendar"]')?.setAttribute('aria-label',annual?'월별 요약 보기':'달력 보기');
    const calendarButton=$('modes').querySelector('[data-mode="calendar"]');if(calendarButton)calendarButton.textContent=annual?'월별 요약':'달력';
    $('workspace').className=calendar?'settlement-workspace is-calendar':'settlement-workspace';
    $('export').disabled=!report;$('export').textContent='Excel 내보내기';
    $('period-title').textContent=annual?`${year}년`:`${year}년 ${month}월`;
    $('costs').hidden=true;$('plan-panel').hidden=!report;$('exceptions').hidden=!report;
    host.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.className=on?'liquid-btn-smoke':'';b.setAttribute('aria-pressed',String(on));});
    if(!report){$('count').textContent='';return;}
    try{
      const period=prepared.period(annual?0:month),events=period.events,t=period.total;
      $('count').textContent=`결제 ${t.count}건`;
      for(const [name,value,cls] of [['입금',t.paid,''],['환불',t.refund,''],['순수납',t.net,'is-primary']]){
        const card=el('div',undefined,cls),valueLine=el('strong',value);valueLine.append(el('small','USDT'));
        card.append(el('span',name),valueLine);if(name==='환불'&&t.reversal!=='0')card.append(el('small',`환불 정정 +${t.reversal}`));$('summary').append(card);
      }
      if(t.distribution!=='0'||t.fees!=='0'||t.ownerWithdrawals!=='0'){
        $('costs').hidden=false;
        const heading=el('span',undefined,'settlement-cashflow-heading'),balance=el('span',undefined,'settlement-cashflow-balance'),chevron=el('span',undefined,'settlement-cashflow-chevron');
        heading.append(el('strong','자금 흐름'),el('small','본인 인출 · 운영자 분배 · 수수료'));
        const amount=el('strong',t.afterCosts);amount.append(el('small','USDT'));
        balance.append(el('span','분배·수수료 반영 후'),amount);chevron.setAttribute('aria-hidden','true');
        $('costs').querySelector('summary').replaceChildren(heading,balance,chevron);
        const groups=el('div',undefined,'settlement-cashflow-groups'),adjusted=el('section'),owner=el('section');
        adjusted.append(el('h5','정산 반영'));
        const dl=el('dl',undefined,'settlement-cost-grid');
        for(const [label,value] of [['운영자 분배',t.distribution],['출금 수수료',t.fees]])dl.append(el('dt',label),el('dd',money(value)));
        adjusted.append(dl);
        const ownerHeading=el('div',undefined,'settlement-cashflow-owner-heading');ownerHeading.append(el('h5','본인 인출'),el('span','자금 이동','settlement-cashflow-tag'));
        const ownerAmount=el('strong',t.ownerWithdrawals,'settlement-cashflow-owner-amount');ownerAmount.append(el('small','USDT'));
        owner.append(ownerHeading,ownerAmount,el('p','순수납에서 다시 차감하지 않습니다.','settlement-help'));groups.append(adjusted,owner);
        $('cost-details').append(groups,el('p','반영 후 금액은 순수납에서 분배·출금 수수료를 뺀 금액이며, 계좌 잔액이 아닙니다.','settlement-help'));
        const flows=period.flows;
        if(flows.length)$('cost-details').append(table(['날짜(KST)','구분','수령인','금액 USDT','수수료'],flows.map(e=>[C.kst(e.occurredAt).slice(0,16),C.labels[e.eventType],e.username,C.amount(-C.units(e.amount)),e.feeAmount||'0'])));
      }
      if(calendar){
        for(const name of ['일','월','화','수','목','금','토'])$('calendar').append(el('span',name,'settlement-weekday'));
        const offset=new Date(Date.UTC(year,month-1,1)).getUTCDay(),days=new Date(Date.UTC(year,month,0)).getUTCDate();
        for(let i=0;i<offset;i++)$('calendar').append(el('span',undefined,'settlement-calendar-blank'));
        const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
        for(let d=1;d<=days;d++){
          const date=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`,daily=prepared.day(date),items=daily.events,sum=daily.total,b=el('button');b.dataset.day=date;b.type='button';
          b.setAttribute('aria-label',`${date}, 거래 ${items.length}건, 순수납 ${sum.net} USDT, 분배·수수료 차감 후 ${sum.afterCosts} USDT`);b.title=b.getAttribute('aria-label');b.setAttribute('aria-pressed',String(day===date));if(date===today)b.setAttribute('aria-current','date');
          b.append(el('span',String(d)));if(items.length){b.classList.add('has-transactions');const amount=el('strong',undefined);amount.append(el('span',sum.net,'settlement-amount-full'),el('span',compact(sum.net),'settlement-amount-short'));b.append(amount,el('small',`${items.length}건`));}
          b.onclick=()=>{if(busy)return;day=day===date?'':date;page=1;closeEditor();renderSelection();$('list').focus({preventScroll:true});};$('calendar').append(b);
        }
        for(let i=0;i<(7-(offset+days)%7)%7;i++)$('calendar').append(el('span',undefined,'settlement-calendar-blank'));
      }
      if(annual&&mode!=='list'){
        const rows=[];for(let m=1;m<=12;m++){const sum=prepared.period(m).total;rows.push([`${m}월`,sum.paid,sum.refund,sum.net,String(sum.count)]);}
        const grid=table(['월','입금 USDT','환불 USDT','순수납 USDT','결제'],rows);grid.classList.add('settlement-annual-table');
        [...grid.querySelectorAll('tbody tr')].forEach((tr,i)=>{const cell=tr.firstElementChild,button=el('button',`${i+1}월`);button.type='button';button.setAttribute('aria-label',`${year}년 ${i+1}월 상세 보기`);button.onclick=()=>{scope='monthly';month=i+1;mode='list';day='';page=1;$('scope').value=scope;$('month').value=month;closeEditor();render();host.closest('.member-dialog-surface')?.scrollTo({top:0});};cell.replaceChildren(button);});
        $('annual').append(grid,el('p','월을 선택하면 해당 월의 거래 목록을 확인할 수 있습니다.','settlement-help'));
      }
      $('breakdown').append(table(['플랜','입금 USDT','순수납 USDT','결제'],period.plans.length?period.plans.map(p=>[plan(p.plan),p.total.paid,p.total.net,String(p.total.count)]):[['해당 기간 내역 없음','—','—','0']]));
      renderList(events,calendar,annual);
      $('exceptions').querySelector('summary').textContent=`미확인·무료 이용권 (${report.exceptions.length}건)`;
      let exCount=0;const exMore=el('button','더 보기','liquid-btn-smoke');exMore.type='button';const appendEx=()=>{for(const r of report.exceptions.slice(exCount,exCount+20))$('exception-list').insertBefore(recordCard(r,true),exMore);exCount+=20;exMore.hidden=exCount>=report.exceptions.length;};$('exception-list').append(exMore);exMore.onclick=appendEx;appendEx();
    }catch(e){report=null;prepared=null;$('export').disabled=true;notice(e.message);}
  }
  function renderSelection(){
    if(!host||!report||!prepared)return;
    $('list').replaceChildren();
    for(const b of $('calendar').querySelectorAll('[data-day]'))b.setAttribute('aria-pressed',String(b.dataset.day===day));
    const annual=scope==='annual';
    renderList(prepared.period(annual?0:month).events,!annual&&mode==='calendar',annual);
  }
  function renderList(events,calendar,annual){
      $('list').hidden=annual&&mode!=='list';$('list').tabIndex=-1;
      if(calendar&&!day){$('list').append(el('div','날짜를 선택해 주세요','settlement-day-prompt'),el('p','선택한 날짜의 정확한 금액과 거래 정보를 이곳에서 확인할 수 있습니다.','settlement-help'));}
      else if(!$('list').hidden){
        const shown=day?prepared.day(day).events:events;
        const heading=el('div',undefined,'settlement-list-heading');heading.append(el('h4',day?`${month}월 ${Number(day.slice(-2))}일`:'거래 목록'),el('span',`${shown.length}건`,'settlement-help'));$('list').append(heading);
        if(calendar){const sum=prepared.day(day).total;$('list').append(el('p',`순수납 ${money(sum.net)}${sum.distribution!=='0'||sum.fees!=='0'?` · 차감 후 ${money(sum.afterCosts)}`:''}`,'settlement-day-total'));}
        renderTransactions(shown,calendar);
      }
  }
  function renderTransactions(shown,calendar){
    const pages=Math.max(1,Math.ceil(shown.length/10));page=Math.max(1,Math.min(page,pages));
    const collection=el('div',undefined,calendar?'settlement-transactions is-day':'settlement-transactions');
    if(!shown.length)collection.append(el('p','해당 기간의 거래가 없습니다.','settlement-empty'));
    else if(!calendar){const header=el('div',undefined,'settlement-transaction-header');for(const text of ['거래일 · KST','유저 · 상품','구분','금액 · USDT','상세'])header.append(el('span',text));collection.append(header);}
    for(const r of shown.slice((page-1)*10,page*10)){
      const item=el('details',undefined,'settlement-transaction'),summary=el('summary'),who=el('span',undefined,'settlement-who');
      who.append(el('strong',r.username),el('small',r.kind==='transfer'?'출금 기록':`${plan(r.plan)} · ${C.period(r.months,r.notes)}`));
      const date=el('time',C.kst(r.occurredAt).slice(calendar?11:0,16),'settlement-date');date.dateTime=r.occurredAt;
      summary.append(date,who,el('span',C.labels[r.eventType],`settlement-event settlement-event--${r.eventType}`),el('strong',r.amount,'settlement-number'),el('span','보기','settlement-detail-label'));
      item.append(summary);item.addEventListener('toggle',()=>{if(item.open&&item.childElementCount===1)item.append(recordCard(r));});collection.append(item);
    }
    $('list').append(collection);
    if(pages>1){const nav=el('nav',undefined,'settlement-pagination');nav.setAttribute('aria-label','거래 목록 페이지');
      const prev=el('button','이전'),next=el('button','다음');prev.type=next.type='button';prev.disabled=page===1;next.disabled=page===pages;
      prev.onclick=()=>{if(busy)return;page--;closeEditor();renderSelection();$('list').focus({preventScroll:true});$('list').scrollIntoView({block:'start'});};next.onclick=()=>{if(busy)return;page++;closeEditor();renderSelection();$('list').focus({preventScroll:true});$('list').scrollIntoView({block:'start'});};
      nav.append(prev,el('span',`${page} / ${pages} · ${shown.length}건`),next);$('list').append(nav);
    }
  }
  function recordCard(r,exception=false){const card=el('article',undefined,'settlement-record');card.append(el('strong',r.kind==='transfer'?r.username:`${r.username} · ${plan(r.plan)}`));
    card.append(el('p',`${r.kind==='transfer'?'':C.period(r.months,r.notes)+' · '}${exception?(r.kind==='receipt'?'입금일 미확인':C.labels[r.kind]):C.labels[r.eventType]} · ${r.amount===null?'신청 '+money(r.requestedAmount??'미확인'):money(r.amount)}`,'settlement-amount'));
    card.append(el('p',exception?`승인 ${C.kst(r.approvedAt)||'미확인'}`:C.kst(r.occurredAt),'settlement-help'));
    if(r.feeAmount&&r.feeAmount!=='0')card.append(el('p',`출금 수수료 ${money(r.feeAmount)}`,'settlement-help'));
    const details=el('details');details.append(el('summary','거래 정보'));for(const [k,v] of [['신청 ID',r.id],['신청 금액',r.requestedAmount],['입금 ID',r.depositId],['출금 참조번호',r.referenceId],['TXID',r.txid],['네트워크',r.chain],['승인',C.kst(r.approvedAt)],['처리',r.source],['증빙',r.evidence],['사유',r.reason],['비고',(r.notes||[]).join(' / ')]])if(v)details.append(el('p',`${k}: ${v}`));card.append(details);
    if(r.kind==='receipt'&&(!r.eventType||r.eventType==='receipt')){
      const b=el('button',r.day?'환불 기록':'입금일 보완','liquid-btn-smoke');b.type='button';b.onclick=()=>r.day?openWithdrawals({receipt:r.id}):edit(r);card.append(b);
      if(r.day){const manual=el('button','증빙으로 수동 기록·정정','settlement-manual-link');manual.type='button';manual.onclick=()=>edit(r);card.append(manual);}
    }
    if(r.withdrawalId){const b=el('button','출금 기록 정정','liquid-btn-smoke');b.type='button';b.onclick=()=>openWithdrawals({withdrawal:r.withdrawalId});card.append(b);}
    else if(['refund','owner_withdrawal','distribution'].includes(r.eventType)){const b=el('button','OKX 출금 연결','liquid-btn-smoke');b.type='button';b.onclick=()=>openWithdrawals({link:r.eventId,receipt:r.eventType==='refund'?r.id:''});card.append(b);}
    return card;}
  function closeEditor(){editing=null;if(host){$('adjust').hidden=true;$('serial').value='';$('adjust-message').textContent='';}}
  function edit(r){if(busy)return;editing={record:r,eventId:crypto.randomUUID(),signature:null};$('adjust').reset();$('adjust-title').textContent=`${r.username} · ${plan(r.plan)}`;$('adjust').hidden=false;$('kind').value=r.day?'refund':'receipt_date';$('kind').onchange();$('adjust-message').textContent='';$('occurred').focus();}
  async function save(e){e.preventDefault();if(busy||!editing||!permitted())return;
    const occurred=$('occurred').value,kind=$('kind').value;
    if(!occurred)return;let amount='0';try{if(kind!=='receipt_date')amount=C.amount(C.units($('amount').value));}catch(err){$('adjust-message').textContent=err.message;return;}
    const data={requestId:editing.record.id,kind,amount,occurredAt:new Date(occurred+'+09:00').toISOString(),evidence:$('evidence').value.trim(),reason:$('reason').value.trim()};
    const signature=JSON.stringify(data);if(editing.signature&&editing.signature!==signature){$('adjust-message').textContent='이전 요청 결과가 불확실합니다. 새로고침하여 저장 여부를 확인한 뒤 다시 작성해 주세요.';return;}editing.signature=signature;
    const token=bridge.token(),gen=bridge.generation(),editState=editing;busy=true;
    for(const input of host.querySelectorAll('button,input,select,textarea'))input.disabled=true;
    try{const result=await bridge.api('admin_settlement_adjustment',{...data,eventId:editState.eventId,token,adminSerial:$('serial').value});
      if(token!==bridge.token()||gen!==bridge.generation()||!host)return;
      if(!result.ok){editState.signature=null;throw Error(withdrawalErrors[result.error]||`기록 실패: ${result.error}`);}closeEditor();busy=false;await load();
    }catch(err){if(host&&token===bridge.token())$('adjust-message').textContent=err.message||'응답을 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복 기록되지 않습니다.';}
    finally{if(host&&token===bridge.token()&&gen===bridge.generation()){busy=false;$('serial').value='';for(const input of host.querySelectorAll('button,input,select,textarea'))input.disabled=false;$('export').disabled=!report;render();}}
  }
  const withdrawalLabels={owner_withdrawal:'본인 인출',refund:'고객 환불',excluded:'정산 제외'};
  const withdrawalErrors={withdrawal_api_not_configured:'Apps Script의 기존 OKX API 설정을 확인해 주세요.',withdrawal_api_rejected:'OKX가 조회를 거절했습니다. API 권한·키·접속 주소를 확인해 주세요.',withdrawal_api_unavailable:'OKX에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',withdrawal_api_retry_later:'OKX 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',withdrawal_revision_conflict:'다른 변경이 먼저 저장되었습니다. 저장된 기록을 다시 조회해 주세요.',withdrawal_existing_record_requires_link:'같은 출금의 기존 기록이 있습니다. 기존 기록을 연결해 주세요.',withdrawal_use_record_correction:'OKX에 연결된 환불입니다. 출금 기록 관리에서 분류·결제 연결을 정정해 주세요.',adjustment_exceeds_balance:'환불 합계가 입금액을 초과하거나 기존 정정과 충돌합니다.',adjustment_before_receipt:'입금일이 없거나 출금 요청 시각이 입금보다 빠릅니다. 거래를 확인해 주세요.',withdrawal_not_found:'OKX 조회 범위에서 출금을 찾지 못했습니다.',withdrawal_link_amount_mismatch:'기존 기록의 금액이 OKX 출금액과 다릅니다.',withdrawal_link_txid_mismatch:'기존 기록의 TXID가 이 출금과 다릅니다.',withdrawal_link_conflict:'기존 기록이 다른 출금에 연결되었거나 참조번호가 다릅니다.',withdrawal_fee_currency_unsupported:'수수료가 USDT가 아닌 출금은 자동 집계할 수 없습니다.',settlement_busy:'다른 작업을 처리 중입니다. 다시 시도해 주세요.',unknown_action:'Apps Script 출금 관리 패치를 배포한 뒤 다시 시도해 주세요.'};
  function withdrawalError(code){return withdrawalErrors[code]||`처리할 수 없습니다 (${code}). 기록을 확인해 주세요.`;}
  function closeWithdrawals(){if(busy)return;withdrawalEpoch++;withdrawalState=null;$('withdrawals').hidden=true;$('w-serial').value='';$('w-form').hidden=true;}
  async function openWithdrawals(target={}){
    if(busy||!permitted())return;closeEditor();withdrawalState={items:[],saved:[],links:[],receipts:[],page:1,cursor:'',target,selected:null,loading:false};
    $('withdrawals').hidden=false;$('w-form').hidden=true;$('withdrawals').scrollIntoView({block:'start'});
    await fetchWithdrawals(true);
  }
  async function fetchWithdrawals(savedOnly,more=false){
    if(busy||!permitted()||!withdrawalState||withdrawalState.loading)return;
    const state=withdrawalState,epoch=++withdrawalEpoch,token=bridge.token(),generation=bridge.generation();state.loading=true;
    $('w-message').textContent=savedOnly?'저장된 출금 기록을 불러오는 중…':'OKX 출금 내역을 조회하는 중…';
    for(const id of ['w-fetch','w-saved','w-more'])$(id).disabled=true;
    try{
      const result=await bridge.api('admin_withdrawal_list',{token,savedOnly,cursor:more?state.cursor:''});
      if(epoch!==withdrawalEpoch||token!==bridge.token()||generation!==bridge.generation()||!permitted()||!host)return;
      if(!result.ok)throw Error(withdrawalError(result.error));
      state.links=result.links;state.receipts=result.receipts;state.saved=result.saved;
      const old=more?state.items:[],all=savedOnly?result.saved:old.concat(result.items),byId=new Map(all.map(i=>[i.snapshot.wdId,i]));
      state.items=[...byId.values()].sort((a,b)=>Number(b.snapshot.ts)-Number(a.snapshot.ts));state.cursor=savedOnly?'':result.nextCursor;state.page=1;state.selected=null;$('w-form').hidden=true;
      $('w-message').textContent=`${savedOnly?'저장된 기록':'OKX 조회 결과'} ${state.items.length}건 · ${C.kst(result.generatedAt)}${state.cursor?' · 이전 내역이 더 있습니다.':''}${!savedOnly?' · 미분류 건은 정산에 포함되지 않습니다.':''}`;
      state.loading=false;renderWithdrawals();
      if(state.target.withdrawal){const item=state.items.find(i=>i.snapshot.wdId===state.target.withdrawal);if(item)selectWithdrawal(item);}
    }catch(e){if(host&&epoch===withdrawalEpoch&&token===bridge.token())$('w-message').textContent=e.message||'조회에 실패했습니다. 다시 시도해 주세요.';}
    finally{if(host&&state===withdrawalState&&epoch===withdrawalEpoch){state.loading=false;for(const id of ['w-fetch','w-saved','w-more'])$(id).disabled=false;}}
  }
  function renderWithdrawals(){
    const state=withdrawalState;if(!state)return;
    const pages=Math.max(1,Math.ceil(state.items.length/8));state.page=Math.max(1,Math.min(state.page,pages));$('w-items').replaceChildren();
    for(const item of state.items.slice((state.page-1)*8,state.page*8)){
      const s=item.snapshot,b=el('button',undefined,'settlement-withdrawal-row');b.type='button';
      const info=el('span');info.append(el('strong',`${s.amt} USDT`),el('small',`${C.kst(new Date(Number(s.ts)).toISOString())} · ${s.chain||'내부 이체'}`),el('small',`출금 ID ${s.wdId} · 수수료 ${s.fee} USDT`));
      b.append(info,el('span',item.error?(item.state==='2'?'확인 필요':'미완료'):withdrawalLabels[item.kind]||(item.matches.length?'기존 기록 있음':'미분류'),'settlement-cashflow-tag'));
      b.disabled=Boolean(item.error);b.title=item.error?withdrawalError(item.error):'분류 및 기록';b.onclick=()=>selectWithdrawal(item);$('w-items').append(b);
    }
    if(!state.items.length)$('w-items').append(el('p','표시할 기록이 없습니다. OKX 출금 불러오기로 최근 내역을 확인하세요.','settlement-empty'));
    $('w-page').textContent=`${state.page} / ${pages}`;$('w-prev').disabled=state.page===1;$('w-next').disabled=state.page===pages;$('w-more').hidden=!state.cursor;
  }
  function selectWithdrawal(item){
    if(busy||withdrawalState.loading)return;const state=withdrawalState,s=item.snapshot;
    state.selected={item,eventId:crypto.randomUUID(),signature:null};$('w-form').reset();$('w-form').hidden=false;
    $('w-title').textContent=item.revision?'출금 기록 정정':'출금 분류';$('w-evidence').textContent=`${s.amt} USDT · 수수료 ${s.fee} USDT · 출금 ID ${s.wdId}`;
    $('w-receipt').replaceChildren(new Option('결제를 선택하세요',''));
    for(const r of state.receipts)$('w-receipt').add(new Option(`${r.username} · ${plan(r.plan)} · ${r.amount} USDT · ${C.kst(r.receivedAt).slice(0,10)}`,r.id));
    $('w-link').replaceChildren(new Option('새 출금 기록 (기존 기록 없음)',''));
    for(const link of state.links.filter(l=>C.units(l.amount.replace(/^-/,''))===C.units(s.amt)))$('w-link').add(new Option(`${C.labels[link.type]} · ${link.amount} USDT · ${C.kst(link.occurredAt)} · ${link.requestId}`,link.eventId));
    $('w-link').value=item.linkedEventId||state.target.link||(item.matches.length===1?item.matches[0]:'');$('w-link').disabled=Boolean(item.revision);
    $('w-kind').value=item.kind||(state.target.receipt?'refund':'');$('w-receipt').value=item.requestId||state.target.receipt||'';
    if(!item.revision)$('w-link').onchange();$('w-kind').onchange();$('w-reason').value=item.reason||'';$('w-save').textContent=item.revision?'정정 기록 저장':'기록 저장';$('w-result').textContent='';
  }
  async function saveWithdrawal(e){
    e.preventDefault();if(busy||!permitted()||!withdrawalState?.selected)return;
    const state=withdrawalState,selected=state.selected,item=selected.item,token=bridge.token(),generation=bridge.generation();
    const payload={withdrawalId:item.snapshot.wdId,previousEventId:item.revision,kind:$('w-kind').value,requestId:$('w-kind').value==='refund'?$('w-receipt').value:'',linkedEventId:item.revision?item.linkedEventId:$('w-link').value,reason:$('w-reason').value.trim()};
    const signature=JSON.stringify(payload);if(selected.signature&&selected.signature!==signature){$('w-result').textContent='이전 요청 결과가 불확실합니다. 저장된 기록을 다시 조회해 주세요.';return;}selected.signature=signature;
    const serial=$('w-serial').value;busy=true;for(const input of host.querySelectorAll('button,input,select,textarea'))input.disabled=true;
    try{
      const result=await bridge.api('admin_withdrawal_save',{...payload,eventId:selected.eventId,token,adminSerial:serial});
      if(!host||token!==bridge.token()||generation!==bridge.generation()||state!==withdrawalState)return;
      if(!result.ok){selected.signature=null;throw Error(withdrawalError(result.error));}
      busy=false;state.target={withdrawal:item.snapshot.wdId};await load();await fetchWithdrawals(true);
      if(host&&token===bridge.token()&&generation===bridge.generation()&&state===withdrawalState)$('w-message').textContent+=report?' · 기록을 저장하고 정산에 반영했습니다.':' · 저장은 완료했으나 정산 재조회에 실패했습니다. 새로고침해 주세요.';
    }catch(e){if(host&&token===bridge.token()&&state===withdrawalState)$('w-result').textContent=e.message||'응답을 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복되지 않습니다.';}
    finally{if(host&&token===bridge.token()&&generation===bridge.generation()){busy=false;$('w-serial').value='';for(const input of host.querySelectorAll('button,input,select,textarea'))input.disabled=false;if(state===withdrawalState){$('w-link').disabled=Boolean(state.selected?.item.revision);renderWithdrawals();}$('export').disabled=!report;}}
  }
  window.SettlementUI={open(b){bridge=b;if(!host)mount();if(!report)load();else render();},reset};
})();
