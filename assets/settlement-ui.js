(function(){
  'use strict';
  const C=SettlementCore;
  let host,bridge,report=null,epoch=0,year=new Date(Date.now()+9*3600000).getUTCFullYear(),month=new Date(Date.now()+9*3600000).getUTCMonth()+1,mode='calendar',day='',editing=null,busy=false;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const $=id=>host.querySelector('#settlement-'+id);
  const plan=p=>bridge?.plan(p)||p;
  const money=v=>`${v} USDT`;
  function notice(text){$('message').textContent=text;}
  function permitted(){return bridge&&bridge.profile()?.grade==='admin';}
  function reset(){epoch++;report=null;editing=null;busy=false;if(host){host.replaceChildren();host=null;}}
  function mount(){
    host=document.getElementById('member-admin-settlement-view');
    host.innerHTML=`<div class="settlement-toolbar"><h4>정산 내역</h4><button id="settlement-refresh" type="button" class="liquid-btn-smoke">새로고침</button></div>
    <p class="settlement-help">실제 입금일 기준 · KST · USDT</p>
    <div class="settlement-toolbar"><label>연도 <select id="settlement-year"></select></label><label id="settlement-month-label">월 <select id="settlement-month"></select></label><button id="settlement-export" class="liquid-btn-smoke" type="button" disabled>Excel 내보내기</button></div>
    <div id="settlement-modes" class="settlement-modes" role="group" aria-label="정산 조회 방식"><button data-mode="calendar" type="button">캘린더</button><button data-mode="monthly" type="button">월간</button><button data-mode="annual" type="button">연간</button></div>
    <p id="settlement-message" role="status" class="settlement-help"></p><div id="settlement-summary" class="settlement-summary"></div>
    <div id="settlement-calendar" class="settlement-calendar"></div><div id="settlement-breakdown"></div><div id="settlement-list"></div>
    <details id="settlement-exceptions"><summary>미확인·무상 기록</summary><p class="settlement-help">선택 연도 승인 기록 및 승인일 미확인 기록입니다. 월 필터와 별도로 표시하며 합계에 포함하지 않습니다.</p><div id="settlement-exception-list"></div></details>
    <form id="settlement-adjust" hidden class="settlement-adjust"><h4 id="settlement-adjust-title"></h4><p class="settlement-help">실제 송금 기능이 아닙니다. 이미 처리한 환불이나 증빙에 따른 정정만 기록하세요.</p>
    <label>기록 유형<select id="settlement-kind"><option value="refund">환불 기록</option><option value="refund_reversal">환불 기록 정정 (+)</option><option value="receipt_date">과거 입금일 보완</option></select></label>
    <label id="settlement-amount-label">금액 USDT<input id="settlement-amount" inputmode="decimal" type="text" autocomplete="off"></label>
    <label>발생 시각 (KST)<input id="settlement-occurred" type="datetime-local" step="1" required></label>
    <label>거래 TXID 또는 증빙 참조<input id="settlement-evidence" maxlength="300" required></label><label>사유<textarea id="settlement-reason" maxlength="500" required></textarea></label>
    <label>마스터 시리얼 재확인<input id="settlement-serial" type="password" autocomplete="off" required></label><div class="settlement-toolbar"><button type="submit" id="settlement-save" class="liquid-btn-white">기록 저장</button><button type="button" id="settlement-cancel" class="liquid-btn-smoke">닫기</button></div><p id="settlement-adjust-message" role="status"></p></form>`;
    for(let y=year;y>=2020;y--)$('year').add(new Option(String(y),String(y)));
    for(let m=1;m<=12;m++)$('month').add(new Option(`${m}월`,String(m)));
    $('month').value=month;
    $('year').onchange=()=>{if(busy)return;year=Number($('year').value);day='';closeEditor();load();};
    $('month').onchange=()=>{month=Number($('month').value);day='';closeEditor();render();};
    $('refresh').onclick=load;
    $('modes').onclick=e=>{const b=e.target.closest('[data-mode]');if(!b)return;mode=b.dataset.mode;day='';render();};
    $('export').onclick=()=>{if(!report||!permitted())return;try{const data=C.xlsx(C.sheets(report,mode==='annual'?0:month,plan));const blob=new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`정산_${year}${mode==='annual'?'':'-'+String(month).padStart(2,'0')}_KST.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){notice(e.message);}};
    $('kind').onchange=()=>{$('amount-label').hidden=$('kind').value==='receipt_date';$('amount').required=$('kind').value!=='receipt_date';};
    $('cancel').onclick=closeEditor;$('adjust').onsubmit=save;
  }
  async function load(){
    if(busy||!permitted())return;const current=++epoch,token=bridge.token(),generation=bridge.generation();report=null;closeEditor();render();notice('정산 기록을 불러오는 중…');$('export').disabled=true;
    try{const result=await bridge.api('admin_settlement',{token,year:String(year)});
      if(current!==epoch||token!==bridge.token()||generation!==bridge.generation()||!permitted())return;
      if(!result.ok)throw Error(result.error==='unknown_action'?'Apps Script에 정산 패치를 배포한 뒤 다시 조회해 주세요.':`정산 조회 실패: ${result.error}`);
      C.total(result.events);report=result;for(const y of result.years)if(![...$('year').options].some(o=>o.value===y))$('year').add(new Option(y,y));render();notice(`조회 시각 ${C.kst(result.generatedAt)} · 원화 환산·세액 계산 미포함`);
    }catch(e){if(current===epoch&&host){notice(e.message||'정산 조회에 실패했습니다.');}}
  }
  function table(headers,rows){const wrap=el('div',undefined,'settlement-table-wrap'),t=el('table');const head=el('tr');headers.forEach(v=>head.append(el('th',v)));const thead=el('thead');thead.append(head);t.append(thead);const body=el('tbody');rows.forEach(row=>{const tr=el('tr');row.forEach(v=>tr.append(el('td',v)));body.append(tr);});t.append(body);wrap.append(t);return wrap;}
  function render(){
    if(!host)return;for(const id of ['summary','calendar','breakdown','list','exception-list'])$(id).replaceChildren();
    $('month-label').hidden=mode==='annual';$('calendar').hidden=mode!=='calendar';$('export').disabled=!report;
    $('export').textContent=mode==='annual'?'연간 Excel 내보내기':'월간 Excel 내보내기';
    host.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.className=on?'liquid-btn-smoke':'';b.setAttribute('aria-pressed',String(on));});
    if(!report)return;
    try{
      const events=C.selected(report,mode==='annual'?0:month),t=C.total(events);
      for(const [name,value] of [['입금',money(t.paid)],['환불',money(t.refund)],['환불 정정',money(t.reversal)],['순수납',money(t.net)],['결제 건수',`${t.count}건`]]){const card=el('div');card.append(el('span',name),el('strong',value));$('summary').append(card);}
      if(mode==='calendar'){
        for(const name of ['일','월','화','수','목','금','토'])$('calendar').append(el('span',name,'settlement-weekday'));
        const offset=new Date(Date.UTC(year,month-1,1)).getUTCDay(),days=new Date(Date.UTC(year,month,0)).getUTCDate();
        for(let i=0;i<offset;i++)$('calendar').append(el('span'));
        for(let d=1;d<=days;d++){const date=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`,items=events.filter(e=>e.day===date),sum=C.total(items),b=el('button');b.type='button';b.setAttribute('aria-label',`${date}, ${items.length}건, 순수납 ${sum.net} USDT`);b.setAttribute('aria-pressed',String(day===date));b.append(el('span',String(d)));if(items.length){b.append(el('strong',sum.net),el('small',`${items.length}건`));}b.onclick=()=>{day=day===date?'':date;render();};$('calendar').append(b);}
      } else if(mode==='annual'){
        const rows=[];for(let m=1;m<=12;m++){const s=C.total(C.selected(report,m));rows.push([`${m}월`,s.paid,s.refund,s.reversal,s.net,String(s.count)]);}$('breakdown').append(table(['월','입금','환불','정정','순수납','건수'],rows));
      }
      const plans=[...new Set(events.map(e=>e.plan))];if(plans.length)$('breakdown').append(table(['플랜','입금 USDT','순수납 USDT','결제 건수'],plans.map(p=>{const s=C.total(events.filter(e=>e.plan===p));return [plan(p),s.paid,s.net,String(s.count)];})));
      $('list').append(el('h4',day?`${day} 상세 내역`:'결제 상세'));
      const shown=events.filter(e=>!day||e.day===day).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
      if(!shown.length)$('list').append(el('p','해당 기간의 확인된 거래가 없습니다.','settlement-help'));
      // Render in batches so long years do not freeze the member dialog.
      let count=0;const more=el('button','더 보기','liquid-btn-smoke');more.type='button';
      const append=()=>{for(const r of shown.slice(count,count+100))$('list').insertBefore(recordCard(r),more);count+=100;more.hidden=count>=shown.length;};
      $('list').append(more);more.onclick=append;append();
      $('exceptions').querySelector('summary').textContent=`미확인·무상 기록 (${report.exceptions.length}건)`;
      let exCount=0;const exMore=el('button','더 보기','liquid-btn-smoke');exMore.type='button';const appendEx=()=>{for(const r of report.exceptions.slice(exCount,exCount+100))$('exception-list').insertBefore(recordCard(r,true),exMore);exCount+=100;exMore.hidden=exCount>=report.exceptions.length;};$('exception-list').append(exMore);exMore.onclick=appendEx;appendEx();
    }catch(e){report=null;$('export').disabled=true;notice(e.message);}
  }
  function recordCard(r,exception=false){const card=el('article',undefined,'settlement-record');card.append(el('strong',`${r.username} · ${plan(r.plan)}`));
    card.append(el('p',`${C.period(r.months)} · ${exception?(r.kind==='receipt'?'입금일 미확인':C.labels[r.kind]):C.labels[r.eventType]} · ${r.amount===null?'신청 '+money(r.requestedAmount??'미확인'):money(r.amount)}`,'settlement-amount'));
    card.append(el('p',exception?`승인 ${C.kst(r.approvedAt)||'미확인'}`:C.kst(r.occurredAt),'settlement-help'));
    const details=el('details');details.append(el('summary','거래 정보'));for(const [k,v] of [['신청 ID',r.id],['신청 금액',r.requestedAmount],['입금 ID',r.depositId],['TXID',r.txid],['네트워크',r.chain],['승인',C.kst(r.approvedAt)],['처리',r.source],['증빙',r.evidence],['사유',r.reason],['비고',(r.notes||[]).join(' / ')]])if(v)details.append(el('p',`${k}: ${v}`));card.append(details);
    if(r.kind==='receipt'&&(!r.eventType||r.eventType==='receipt')){const b=el('button',exception?'입금일·환불 기록':'환불·정정 기록','liquid-btn-smoke');b.type='button';b.onclick=()=>edit(r);card.append(b);}return card;}
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
      if(!result.ok){editState.signature=null;throw Error(`기록 실패: ${result.error}`);}closeEditor();busy=false;await load();
    }catch(err){if(host&&token===bridge.token())$('adjust-message').textContent=err.message||'응답을 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복 기록되지 않습니다.';}
    finally{busy=false;if(host){$('serial').value='';for(const input of host.querySelectorAll('button,input,select,textarea'))input.disabled=false;$('export').disabled=!report;}}
  }
  window.SettlementUI={open(b){bridge=b;if(!host)mount();if(!report)load();else render();},reset};
})();
