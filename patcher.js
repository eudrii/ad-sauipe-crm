const fs = require('fs');
let content = fs.readFileSync('c:\\\\Users\\\\adrie\\\\.gemini\\\\antigravity\\\\scratch\\\\ad-sauipe-crm\\\\src\\\\main.js', 'utf8');

const targetStr = `      if(ev.regras.tipo === 'pontual') {
         dataDisplay = ev.regras.pontual_data.split('-').reverse().join('/');
         horaDisp = ev.regras.pontual_hora ? \\\` às \\\${ev.regras.pontual_hora}h\\\` : '';
      } else if(ev.regras.tipo === 'multiplos') {
         dataDisplay = 'Dias ' + ev.regras.multiplos_dias.map(d=>d.split('-').reverse().join('/')).join(', ');
         horaDisp = ev.regras.multiplos_hora ? \\\` às \\\${ev.regras.multiplos_hora}h\\\` : '';
      } else if(ev.regras.tipo === 'repetitivo') {
         const ruleMap = {
            '1_seg': '1ª Segunda-feira de cada Mês',
            '1_ter': '1ª Terça-feira de cada Mês',
            '1_sab': '1º Sábado de cada Mês',
            '1_dom': '1º Domingo de cada Mês'
         };
         dataDisplay = \\\`<span style="font-size:0.9rem;">Repete: \\\${ruleMap[ev.regras.repete_regra]}</span><br><small style="color:var(--text-muted)">Até \\\${ev.regras.repete_fim.split('-').reverse().join('/')}</small>\\\`;
         horaDisp = ev.regras.repete_hora ? \\\` às \\\${ev.regras.repete_hora}h\\\` : '';
      }

      let respHtml = '';
      ev.responsaveis.forEach(r => {
          let num = r.telefone.replace(/\\\\D/g, '');
          respHtml += \\\`<a href="https://wa.me/55\\\${num}" target="_blank" class="resp-pill" title="\\\${r.nome}">
                          <i class="ri-whatsapp-line"></i> \\\${r.funcao}
                       </a>\\\`;
      });

      card.innerHTML = \\\`
         \\\${ev.cartaz ? \\\`<img src="\\\${ev.cartaz}" alt="Cartaz \\\${ev.nome}" class="event-img">\\\` : \\\`<div class="event-no-img"><i class="ri-image-line"></i></div>\\\`}
         <div class="event-content">
            <span class="badge \\\${ev.alcance === 'Todo o Campo' ? 'b-pink' : ''}" style="margin-bottom:8px; display:inline-block; \\\${ev.alcance === 'Todo o Campo'? 'color:white': ''}">\\\${ev.alcance === 'Todo o Campo' ? 'Geral' : ev.congregacao}</span>
            <h3 class="event-title">\\\${ev.nome}</h3>\`;

const replaceStr = `      let encerradoBadgeHtml = '';
      const hoje = new Date();
      hoje.setHours(0,0,0,0);

      if(ev.regras.tipo === 'pontual') {
         dataDisplay = ev.regras.pontual_data.split('-').reverse().join('/');
         horaDisp = ev.regras.pontual_hora ? \\\` às \\\${ev.regras.pontual_hora}h\\\` : '';
         if(new Date(ev.regras.pontual_data + 'T12:00:00Z') < hoje) encerradoBadgeHtml = '<span class="badge" style="background:#52525b; color:white; margin-bottom:8px; margin-left:5px; display:inline-block;">Encerrado</span>';
      } else if(ev.regras.tipo === 'multiplos') {
         dataDisplay = 'Dias ' + ev.regras.multiplos_dias.map(d=>d.split('-').reverse().join('/')).join(', ');
         horaDisp = ev.regras.multiplos_hora ? \\\` às \\\${ev.regras.multiplos_hora}h\\\` : '';
         if(ev.regras.multiplos_dias.length > 0) {
            let maxDateStr = [...ev.regras.multiplos_dias].sort().pop();
            if(new Date(maxDateStr + 'T12:00:00Z') < hoje) encerradoBadgeHtml = '<span class="badge" style="background:#52525b; color:white; margin-bottom:8px; margin-left:5px; display:inline-block;">Encerrado</span>';
         }
      } else if(ev.regras.tipo === 'repetitivo') {
         const ruleMap = {
            '1_seg': '1ª Segunda-feira de cada Mês',
            '1_ter': '1ª Terça-feira de cada Mês',
            '1_sab': '1º Sábado de cada Mês',
            '1_dom': '1º Domingo de cada Mês'
         };
         dataDisplay = \\\`<span style="font-size:0.9rem;">Repete: \\\${ruleMap[ev.regras.repete_regra]}</span><br><small style="color:var(--text-muted)">Até \\\${ev.regras.repete_fim.split('-').reverse().join('/')}</small>\\\`;
         horaDisp = ev.regras.repete_hora ? \\\` às \\\${ev.regras.repete_hora}h\\\` : '';
         if(new Date(ev.regras.repete_fim + 'T12:00:00Z') < hoje) encerradoBadgeHtml = '<span class="badge" style="background:#52525b; color:white; margin-bottom:8px; margin-left:5px; display:inline-block;">Encerrado</span>';
      }

      let respHtml = '';
      ev.responsaveis.forEach(r => {
          let num = r.telefone.replace(/\\\\D/g, '');
          respHtml += \\\`<a href="https://wa.me/55\\\${num}" target="_blank" class="resp-pill" title="\\\${r.nome}">
                          <i class="ri-whatsapp-line"></i> \\\${r.funcao}
                       </a>\\\`;
      });

      card.innerHTML = \\\`
         \\\${ev.cartaz ? \\\`<img src="\\\${ev.cartaz}" alt="Cartaz \\\${ev.nome}" class="event-img" style="\\\${encerradoBadgeHtml ? 'filter: grayscale(1); opacity: 0.6;' : ''}">\\\` : \\\`<div class="event-no-img"><i class="ri-image-line"></i></div>\\\`}
         <div class="event-content">
            <span class="badge \\\${ev.alcance === 'Todo o Campo' ? 'b-pink' : ''}" style="margin-bottom:8px; display:inline-block; \\\${ev.alcance === 'Todo o Campo'? 'color:white': ''}">\\\${ev.alcance === 'Todo o Campo' ? 'Geral' : ev.congregacao}</span>
            \\\${encerradoBadgeHtml}
            <h3 class="event-title" style="\\\${encerradoBadgeHtml ? 'color:var(--text-muted); text-decoration:line-through;' : ''}">\\\${ev.nome}</h3>\`;

if(content.includes('dataDisplay = ev.regras.pontual_data.split')) {
   content = content.replace(targetStr, replaceStr);
   fs.writeFileSync('c:\\\\Users\\\\adrie\\\\.gemini\\\\antigravity\\\\scratch\\\\ad-sauipe-crm\\\\src\\\\main.js', content);
   console.log('SUCCESS');
} else {
   console.log('NOT_FOUND');
}
