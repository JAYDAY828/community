/* Pure settlement calculations and an offline OOXML export; no network dependencies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SettlementCore=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function units(value){
    const s=String(value ?? '');if(!/^-?\d+(?:\.\d{1,8})?$/.test(s))throw Error('금액 형식을 확인해 주세요.');
    const sign=s.startsWith('-')?-1:1,[a,b='']=s.replace('-','').split('.');
    const n=sign*(Number(a)*1e8+Number(b.padEnd(8,'0')));if(!Number.isSafeInteger(n))throw Error('집계 가능한 금액 범위를 초과했습니다.');return n;
  }
  function amount(n){if(!Number.isSafeInteger(n))throw Error('합계 범위 초과');return `${n<0?'-':''}${Math.floor(Math.abs(n)/1e8)}.${String(Math.abs(n)%1e8).padStart(8,'0')}`.replace(/\.?0+$/,'');}
  function total(events){
    let paid=0,refund=0,reversal=0,distribution=0,owner=0,fees=0,count=0;const seen=new Set();
    for(const e of events){
      if(seen.has(e.eventId))throw Error('중복 거래가 있습니다.');seen.add(e.eventId);
      const n=units(e.amount),fee=units(e.feeAmount??'0');if(fee<0)throw Error('수수료 오류');fees+=fee;
      if(e.eventType==='receipt'){if(n<=0)throw Error('입금액 오류');paid+=n;count++;}
      else if(e.eventType==='refund'){if(n>=0)throw Error('환불액 오류');refund-=n;}
      else if(e.eventType==='refund_reversal'){if(n<=0)throw Error('환불 정정액 오류');reversal+=n;}
      else if(e.eventType==='distribution'){if(n>=0)throw Error('분배액 오류');distribution-=n;}
      else if(e.eventType==='owner_withdrawal'){if(n>=0)throw Error('본인 인출액 오류');owner-=n;}
      else throw Error('알 수 없는 거래 유형');
      for(const v of [paid,refund,reversal,distribution,owner,fees])if(!Number.isSafeInteger(v))throw Error('합계 범위 초과');
    }
    const net=paid-refund+reversal;
    return {paid:amount(paid),refund:amount(refund),reversal:amount(reversal),net:amount(net),count,
      distribution:amount(distribution),ownerWithdrawals:amount(owner),fees:amount(fees),afterDistribution:amount(net-distribution),afterCosts:amount(net-distribution-fees)};
  }
  function kst(iso){return iso ? new Date(Date.parse(iso)+9*3600000).toISOString().slice(0,19).replace('T',' ')+' KST' : '';}
  const labels={receipt:'입금',refund:'환불',refund_reversal:'환불 정정',distribution:'운영자 분배',owner_withdrawal:'본인 인출',free:'무료 이용권',unverified:'입금 미확인',conflict:'확인 필요'};
  function period(months,notes=[]){
    if(months!==null&&months!==undefined)return months===0?'무제한':`${months}개월`;
    // Historical fixed-end promotions retain their end date in the source notes.
    const event=(Array.isArray(notes)?notes:[]).join(' / ').match(/이벤트 이용기간:\s*(\d{4}-\d{2}-\d{2})까지/);
    return event?`이벤트 · ${event[1]}까지`:'미확인';
  }
  function selected(report,month){return report.events.filter(e=>!month||e.day.slice(5,7)===String(month).padStart(2,'0'));}
  // A report is a snapshot: discard this index whenever a fresh response arrives.
  function prepare(report){
    const all=report.events.slice().sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
    const months=new Map(),days=new Map(),periods=new Map(),daily=new Map();
    for(const e of all){
      const m=Number(e.day.slice(5,7));
      if(!months.has(m))months.set(m,[]);months.get(m).push(e);
      if(!days.has(e.day))days.set(e.day,[]);days.get(e.day).push(e);
    }
    // Validate the whole response, including duplicates across different months.
    const annualTotal=total(all);
    return {
      period(month){
        if(!periods.has(month)){
          const events=month?(months.get(month)||[]):all,byPlan=new Map(),flows=[];
          for(const e of events){
            if(['distribution','owner_withdrawal'].includes(e.eventType)){flows.push(e);continue;}
            if(!byPlan.has(e.plan))byPlan.set(e.plan,[]);byPlan.get(e.plan).push(e);
          }
          periods.set(month,{events,total:month?total(events):annualTotal,flows,
            plans:[...byPlan].map(([plan,items])=>({plan,total:total(items)}))});
        }
        return periods.get(month);
      },
      day(date){
        if(!daily.has(date)){const events=days.get(date)||[];daily.set(date,{events,total:total(events)});}
        return daily.get(date);
      }
    };
  }
  function sheets(report,month,planLabel){
    const events=selected(report,month),sum=total(events),label=month?`${report.year}-${String(month).padStart(2,'0')}`:report.year;
    const summary=[['정산 기간',label],['기준','입금일 / 출금 기록일 · KST · USDT (OKX 출금은 완료 상태의 요청 시각)'],['추출 시각',kst(report.generatedAt)],['출처','SubscriptionRequests / SettlementReceipts / PaymentLedger / SettlementAdjustments / SettlementHistory / SettlementWithdrawals'],['안내','입금일 미확인·무료 이용권·미검증 건은 금액 합계에서 제외. 원화 환산·세액 계산 미포함.'],['입금 합계 USDT',Number(sum.paid)],['환불 USDT',Number(sum.refund)],['환불 정정 USDT',Number(sum.reversal)],['순수납 USDT',Number(sum.net)],['결제 건수',sum.count],[],['월','입금 USDT','환불 USDT','환불 정정 USDT','순수납 USDT','결제 건수','운영자 분배 USDT','수수료 USDT','분배·수수료 차감 후 USDT']];
    const transfers=events.filter(e=>['distribution','owner_withdrawal'].includes(e.eventType));
    if(transfers.length || sum.fees!=='0') summary.splice(10,0,['운영자 분배 USDT',Number(sum.distribution)],['출금 수수료 USDT',Number(sum.fees)],['분배·수수료 차감 후 USDT',Number(sum.afterCosts)],['본인 인출 USDT (수납액 차감 제외)',Number(sum.ownerWithdrawals)],['집계 범위','본인 인출은 자금 이동으로 별도 표시. 차감 후 금액은 계좌 잔액이 아닙니다. 환불 수령액과 출금 수수료를 분리합니다.']);
    for(let m=1;m<=12;m++){if(month&&m!==Number(month))continue;const t=total(selected(report,m));summary.push([`${report.year}-${String(m).padStart(2,'0')}`,Number(t.paid),Number(t.refund),Number(t.reversal),Number(t.net),t.count,Number(t.distribution),Number(t.fees),Number(t.afterCosts)]);}
    summary.push([],['플랜','입금 USDT','환불 USDT','환불 정정 USDT','순수납 USDT','결제 건수']);
    const customerEvents=events.filter(e=>!['distribution','owner_withdrawal'].includes(e.eventType));
    for(const p of [...new Set(customerEvents.map(e=>e.plan))]){const t=total(customerEvents.filter(e=>e.plan===p));summary.push([planLabel(p),Number(t.paid),Number(t.refund),Number(t.reversal),Number(t.net),t.count]);}
    const detail=[['거래 ID','신청 ID','유저','플랜','이용기간','유형','거래 시각 KST','거래 시각 UTC','승인 시각 KST','신청 USDT','입출금 USDT','정확한 금액 원문','TXID','입금 ID','네트워크','처리 경로','근거','증빙','사유','정정자','기록 UTC','비고','출금 수수료 USDT','수수료 원문','OKX 출금 참조번호']];
    for(const e of events)detail.push([e.eventId,e.id,e.username,e.kind==='transfer'?'—':planLabel(e.plan),e.kind==='transfer'?'—':period(e.months,e.notes),labels[e.eventType],kst(e.occurredAt),e.occurredAt,kst(e.approvedAt),e.requestedAmount===null?'':Number(e.requestedAmount),Number(e.amount),e.amount,e.txid,e.depositId,e.chain,e.source,e.basis,e.evidence||'',e.reason||'',e.actor||'',e.recordedAt||'',(e.notes||[]).join(' / '),Number(e.feeAmount||'0'),e.feeAmount||'0',e.referenceId||'']);
    const exceptions=[['범위','선택 연도 승인 기록 및 승인일 미확인 기록. 월 선택과 무관하게 연도 전체를 포함.'],['신청 ID','유저','플랜','기간','분류','신청 USDT','확인 입금 USDT','승인 KST','TXID','입금 ID','비고']];
    for(const r of report.exceptions)exceptions.push([r.id,r.username,planLabel(r.plan),period(r.months,r.notes),r.kind==='receipt'?'입금일 미확인':labels[r.kind],r.requestedAmount===null?'':Number(r.requestedAmount),r.amount===null?'':Number(r.amount),kst(r.approvedAt),r.txid,r.depositId,(r.notes||[]).join(' / ')]);
    const audit=[['범위','선택 연도 거래 및 관련 정정 기록'],['Event ID','Request ID','Type','Amount USDT','Occurred At UTC','Evidence','Reason','Actor','Recorded At UTC']];
    for(const a of report.adjustments||[])audit.push(audit[1].map(k=>a[k]||''));
    const result=[{name:'정산 요약',rows:summary},{name:'거래 상세',rows:detail},{name:'미확인 및 무료 이용권',rows:exceptions},{name:'기록 및 정정 이력',rows:audit}];
    if(transfers.length) result.push({name:'분배 및 본인 인출',rows:[['범위','선택 기간 내 실제 출금. 본인 인출은 순수납·분배 후 금액에서 차감하지 않습니다.'],['시각 KST','유형','수령인','출금 USDT','수수료 USDT','정확한 금액 원문','TXID','OKX 참조번호','증빙','메모'],...transfers.map(e=>[kst(e.occurredAt),labels[e.eventType],e.username,-Number(e.amount),Number(e.feeAmount||'0'),e.amount,e.txid,e.referenceId,e.evidence,e.reason])]});
    return result;
  }
  const xml=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  function column(i){let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;}
  function zip(files){
    const enc=new TextEncoder(),parts=[],central=[];let offset=0;
    const header=(size)=>{const a=new Uint8Array(size);return [a,new DataView(a.buffer)];};
    const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
    for(const [name,text] of files){const n=enc.encode(name),data=enc.encode(text),sum=crc(data),[h,v]=header(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);parts.push(h,n,data);
      const [c,d]=header(46);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,sum,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,n.length,true);d.setUint32(42,offset,true);central.push(c,n);offset+=30+n.length+data.length;}
    const length=central.reduce((n,p)=>n+p.length,0),[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);const result=new Uint8Array(offset+length+22);let pos=0;for(const p of [...parts,...central,end]){result.set(p,pos);pos+=p.length;}return result;
  }
  // Presentation metadata is separate from the exported records and exact money strings.
  function exportLayout(sheet,index){
    const rows=[],merges=[];
    const add=(values,role='body',height=26,spans=[])=>{
      rows.push({values,role,height});const r=rows.length;
      for(const [a,b] of spans)merges.push(`${column(a)}${r}:${column(b)}${r}`);
    };
    if(index===0){
      const value=new Map(sheet.rows.filter(r=>r.length===2));
      add([], 'blank',12);
      add([`${value.get('정산 기간')} 정산 내역`],'title',32,[[0,8]]);
      add([`${value.get('기준')}  ·  추출 ${value.get('추출 시각')}`],'note',24,[[0,8]]);
      add([],'blank',10);
      add(['입금 USDT','','','환불 USDT','','','순수납 USDT'],'metric-label',24,[[0,2],[3,5],[6,8]]);
      add([value.get('입금 합계 USDT'),'','',value.get('환불 USDT'),'','',value.get('순수납 USDT')],'metric',36,[[0,2],[3,5],[6,8]]);
      add([],'blank',10);
      const pairs=[['결제 건수',value.get('결제 건수'),'환불 정정 USDT',value.get('환불 정정 USDT')]];
      if(value.has('운영자 분배 USDT'))pairs.push(
        ['운영자 분배 USDT',value.get('운영자 분배 USDT'),'출금 수수료 USDT',value.get('출금 수수료 USDT')],
        ['분배·수수료 차감 후 USDT',value.get('분배·수수료 차감 후 USDT'),'본인 인출 USDT · 자금 이동',value.get('본인 인출 USDT (수납액 차감 제외)')]);
      for(const [a,b,c,d] of pairs)add([a,'',b,'','',c,'',d],'pair',28,[[0,1],[2,3],[5,6],[7,8]]);
      add([],'blank',12);
      add(['월별 정산'],'section',27,[[0,8]]);
      add(['월','입금\nUSDT','환불\nUSDT','환불 정정\nUSDT','순수납\nUSDT','결제 건수','운영자 분배\nUSDT','수수료\nUSDT','차감 후\nUSDT'],'header',36);
      const monthly=sheet.rows.findIndex(r=>r[0]==='월'),plans=sheet.rows.findIndex(r=>r[0]==='플랜');
      for(const row of sheet.rows.slice(monthly+1,plans-1))add(row,'body',27);
      add([],'blank',12);
      add(['플랜별 정산'],'section',27,[[0,8]]);
      add(['플랜','','','','입금 USDT','환불 USDT','환불 정정 USDT','순수납 USDT','결제 건수'],'header',32,[[0,3]]);
      for(const row of sheet.rows.slice(plans+1))add([row[0],'','','',...row.slice(1)],'body',28,[[0,3]]);
      add([],'blank',12);
      for(const label of ['안내','집계 범위','출처'])if(value.has(label))add([label,'',value.get(label)],'note',38,[[0,1],[2,8]]);
      return {rows,merges,widths:[22,17,17,17,17,13,18,18,19],freeze:0,printCols:9};
    }
    const hasScope=index>=2,sourceHeader=hasScope?1:0;
    // Put the working columns before IDs and evidence, preserving every source field.
    const order=index===1?[6,2,3,4,5,10,22,9,11,23,0,1,12,13,24,14,15,16,7,8,20,17,18,19,21]:sheet.rows[sourceHeader].map((_,i)=>i);
    const records=sheet.rows.slice(sourceHeader+1);
    if(index===1)records.sort((a,b)=>String(a[7]).localeCompare(String(b[7])));
    const data=[sheet.rows[sourceHeader],...records].map(row=>order.map(c=>row[c]??''));
    const widths=index===1?[25,17,29,29,16,20,19,19,24,24,44,44,72,26,26,20,22,24,29,25,29,64,72,22,100]
      :index===2?[42,17,29,28,20,20,20,26,72,26,100]
      :index===3?[42,42,22,22,29,64,72,22,29]
      :[25,20,18,22,22,26,72,28,64,100];
    add([sheet.name],'title',32,[[0,Math.min(7,data[0].length-1)]]);
    add([hasScope?sheet.rows[0][1]:'실제 입출금일 · KST · USDT. 거래 식별자·원문·증빙은 오른쪽 열에서 확인할 수 있습니다.'],'note',32,[[0,Math.min(7,data[0].length-1)]]);
    add(data[0],'header',34);
    const textWidth=v=>[...String(v)].reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0);
    for(const row of data.slice(1)){
      const lines=Math.max(1,...row.map((v,c)=>typeof v==='number'?1:Math.ceil(textWidth(v)/Math.max(1,widths[c]-2))));
      add(row,'body',Math.max(30,lines*14+8));
    }
    return {rows,merges,widths,freeze:3,freezeCols:index===1?2:0,filter:3,printCols:index===1?8:data[0].length};
  }
  function xlsx(sheets){
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/package/2006/relationships',base='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    const layouts=sheets.map(exportLayout),formats=Array.from({length:9},(_,n)=>{const f='#,##0'+(n?'.'+'0'.repeat(n):'');return `${f};[Red]-${f};0`;});
    const styles=[],styleIds=new Map();
    const style=(role,value,band)=>{
      const number=typeof value==='number'&&Number.isFinite(value);
      const precision=number?(value.toFixed(8).replace(/0+$/,'').split('.')[1]||'').length:0;
      const font=role==='title'?2:role==='metric'?3:role==='header'?1:['section','metric-label'].includes(role)?4:role==='note'?5:0;
      const fill=role==='header'?2:['metric','metric-label'].includes(role)?4:role==='section'?3:role==='body'&&band?3:0;
      const align=role==='header'?'center':number?'right':'left';
      const wrap=['header','note'].includes(role)||(role==='body'&&!number)?1:0,border=role==='body'?1:0;
      const key=[font,fill,align,wrap,border,role==='body',number?precision:'text'].join(':');
      if(!styleIds.has(key)){
        styleIds.set(key,styles.length);
        styles.push(`<xf fontId="${font}" fillId="${fill}" borderId="${border}" numFmtId="${number?164+precision:0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${number?' applyNumberFormat="1"':''}><alignment horizontal="${align}" vertical="center" wrapText="${wrap}"${role==='body'?' indent="1"':''}/></xf>`);
      }
      return styleIds.get(key);
    };
    style('body','',false);
    const worksheetFiles=layouts.map((layout,i)=>{
      const {rows,merges,widths,freeze,freezeCols=0,filter}=layout;
      const pane=freeze?`<pane${freezeCols?` xSplit="${freezeCols}"`:''} ySplit="${freeze}" topLeftCell="${column(freezeCols)}${freeze+1}" activePane="${freezeCols?'bottomRight':'bottomLeft'}" state="frozen"/>`:'';
      const data=rows.map((row,r)=>{
        const values=Array.from({length:row.values.length?widths.length:0},(_,c)=>row.values[c]??'');
        return `<row r="${r+1}" ht="${row.height}" customHeight="1">${values.map((v,c)=>{
          const ref=column(c)+(r+1),id=style(row.role,v,r%2===0);
          return typeof v==='number'&&Number.isFinite(v)?`<c r="${ref}" s="${id}"><v>${v}</v></c>`:`<c r="${ref}" s="${id}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
        }).join('')}</row>`;
      }).join('');
      return [`xl/worksheets/sheet${i+1}.xml`,`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${column(widths.length-1)}${rows.length}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="26"/><cols>${widths.map((w,c)=>`<col min="${c+1}" max="${c+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData>${filter?`<autoFilter ref="A${filter}:${column(widths.length-1)}${rows.length}"/>`:''}${merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:''}<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${xml(sheets[i].name)}&amp;R&amp;P / &amp;N</oddFooter></headerFooter></worksheet>`];
    });
    const font=(size,color,bold=false,italic=false)=>`<font>${bold?'<b/>':''}${italic?'<i/>':''}<sz val="${size}"/><color rgb="FF${color}"/><name val="맑은 고딕"/><family val="2"/></font>`;
    const fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>',...['30363D','F3F5F7','F5F1E6'].map(c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)];
    const definitions=layouts.map((l,i)=>{const name=`'${sheets[i].name.replace(/'/g,"''")}'`;return `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${xml(name)}!$A$1:$${column(l.printCols-1)}$${l.rows.length}</definedName>${l.filter?`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xml(name)}!$${l.filter}:$${l.filter}</definedName>`:''}`;}).join('');
    const files=[['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],['_rels/.rels',`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${base}officeDocument" Target="xl/workbook.xml"/></Relationships>`],['xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="${base.slice(0,-1)}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${definitions}</definedNames></workbook>`],['xl/_rels/workbook.xml.rels',`<Relationships xmlns="${rel}">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="${base}worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${base}styles" Target="styles.xml"/></Relationships>`],['xl/styles.xml',`<styleSheet xmlns="${ns}"><numFmts count="9">${formats.map((f,i)=>`<numFmt numFmtId="${164+i}" formatCode="${xml(f)}"/>`).join('')}</numFmts><fonts count="6">${font(10,'24292F')+font(10,'FFFFFF',true)+font(16,'24292F',true)+font(16,'24292F',true)+font(10,'24292F',true)+font(10,'57606A',false,true)}</fonts><fills count="5">${fills.join('')}</fills><borders count="2"><border/><border><bottom style="hair"><color rgb="FFE1E5EA"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],...worksheetFiles];
    return zip(files);
  }
  return {units,amount,total,kst,labels,period,selected,prepare,sheets,xlsx};
});
