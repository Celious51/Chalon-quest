];

function diffOf(i){var n=i+1;if(n<=150)return{name:"Facile",pts:1,cls:"easy"};if(n<=300)return{name:"Moyenne",pts:2,cls:"med"};if(n<=450)return{name:"Difficile",pts:3,cls:"hard"};return{name:"Ultime",pts:4,cls:"ultra"};}

var peer=null,conn=null,role=null,myPseudo="",otherPseudo="";
var scores={p1:0,p2:0},names={p1:"J1",p2:"J2"};
var order=[],qIndex=0,total=0,curNum=0;
var answered={p1:false,p2:false},answers={},myAnswer=null,lastQuestion=null;
var countdownInt=null,advanceTimer=null;

function $(id){return document.getElementById(id);}
function showScreen(id){var s=document.querySelectorAll(".screen");for(var i=0;i<s.length;i++)s[i].classList.remove("active");$(id).classList.add("active");}
function toast(msg,err){var t=document.createElement("div");t.className="toast"+(err?" err":"");t.textContent=msg;$("toasts").appendChild(t);setTimeout(function(){t.style.transition="opacity .4s";t.style.opacity="0";setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},400);},3200);}
function goHome(){if(countdownInt)clearInterval(countdownInt);if(advanceTimer)clearTimeout(advanceTimer);try{if(peer)peer.destroy();}catch(e){}peer=null;conn=null;role=null;myPseudo="";otherPseudo="";$("scoreboard").classList.add("hidden");showScreen("screen-home");}
function sanitizeId(s){return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,40)||("p"+Math.floor(Math.random()*1e8).toString(36));}

function norm(s){return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();}
function normAns(s){var t=norm(s);var map={"1":"un","2":"deux","3":"trois","4":"quatre","5":"cinq","6":"six","7":"sept","8":"huit","9":"neuf","10":"dix"};t=t.replace(/\d+/g,function(m){return map[m]||m;});return t;}
function words(s){return s.split(" ").filter(function(w){return w.length>=4&&/[a-z0-9]/.test(w)&&!/^\d+$/.test(w);});}
function isCorrect(q,ans){
  var letter=normAns(ans);if(!letter)return false;
  if(q[1]===1)return normAns(q[3])===letter;
  var expected=q[3],low=expected.toLowerCase();
  if(low.indexOf("libre")>=0||low.indexOf("plusieurs")>=0)return true;
  var ea=normAns(expected);
  if(letter===ea)return true;
  if(ea.indexOf(letter)>=0&&letter.length>=4)return true;
  if(letter.indexOf(ea)>=0&&ea.length>=4)return true;
  var w=words(ea);
  if(w.length>0&&w.every(function(x){return letter.indexOf(x)>=0;}))return true;
  var alts=ea.split(/\s+(?:et|ou)\s+|\/|,|;/);
  for(var i=0;i<alts.length;i++){var pw=words(alts[i]);if(pw.length>0&&pw.every(function(x){return letter.indexOf(x)>=0;}))return true;}
  return false;
}

function onPeerError(err){
  var t=(err&&err.type)||"";
  if(t==="unavailable-id"){toast("Ce pseudo est déjà utilisé. Choisis-en un autre.","err");goHome();}
  else if(t==="peer-unavailable"){toast("Aucun salon trouvé avec ce pseudo.","err");goHome();}
  else if(t==="network"||t==="server-error"||t==="socket-error"||t==="socket-closed"){toast("Problème de connexion réseau.","err");goHome();}
}
function bindConn(c){
  conn=c;
  c.on("close",function(){toast("L'adversaire a quitté la partie.","err");setTimeout(goHome,900);});
  c.on("error",function(){toast("Connexion interrompue.","err");setTimeout(goHome,900);});
}

function setScores(a,b){scores={p1:a,p2:b};updateScoreboard();}
function updateScoreboard(){$("p1Name").textContent=names.p1;$("p2Name").textContent=names.p2;$("p1Pts").textContent=scores.p1;$("p2Pts").textContent=scores.p2;}
function setDot(id,done){var el=$(id);el.className="dot"+(done?" done":"");}

function updateStatusUI(){
  updateScoreboard();
  var iAmP1=(role==="host");
  var me=iAmP1?answered.p1:answered.p2;
  var other=iAmP1?answered.p2:answered.p1;
  setDot(iAmP1?"dot1":"dot2",me);
  setDot(iAmP1?"dot2":"dot1",other);
  $("waitingMsg").classList.toggle("hidden",!(me&&!other));
  var opts=document.querySelectorAll("#qcmArea .opt");
  for(var i=0;i<opts.length;i++)opts[i].disabled=!!me;
  $("textAnswer").disabled=!!me;$("btnSubmitText").disabled=!!me;
}

function renderQuestion(d){
  if(countdownInt)clearInterval(countdownInt);
  lastQuestion=d;myAnswer=null;curNum=d.num;
  answered={p1:false,p2:false};answers={};
  $("qCount").textContent="Question "+d.num+" / "+d.total;
  $("progressFill").style.width=((d.num-1)/d.total*100)+"%";
  var b=$("diffBadge");b.textContent=d.diff;b.className="badge "+d.dcls;
  $("ptsBadge").textContent="+"+d.pts+" pt"+(d.pts>1?"s":"");
  $("qText").textContent=d.q;
  $("qcmArea").innerHTML="";
  $("qcmArea").classList.remove("hidden");
  $("textArea").classList.add("hidden");
  $("waitingMsg").classList.add("hidden");
  $("revealArea").classList.add("hidden");
  if(d.t===1){
    for(var i=0;i<d.o.length;i++){
      (function(i){var btn=document.createElement("button");btn.className="opt";
        var key=document.createElement("span");key.className="key";key.textContent=String.fromCharCode(65+i);
        btn.appendChild(key);btn.appendChild(document.createTextNode(d.o[i]));
        btn.onclick=function(){handleOwnAnswer(String.fromCharCode(65+i));};
        $("qcmArea").appendChild(btn);})(i);
    }
  }else{
    $("qcmArea").classList.add("hidden");
    $("textArea").classList.remove("hidden");
    $("textAnswer").value="";
    setTimeout(function(){try{$("textAnswer").focus();}catch(e){}},80);
  }
  updateStatusUI();
  showScreen("screen-game");
}

function handleOwnAnswer(val){
  if(role==="host"){
    if(answered.p1)return;
    answered.p1=true;answers.p1=val;myAnswer=val;
    broadcastStatus();
    maybeReveal();
  }else{
    if(answered.p2)return;
    answered.p2=true;answers.p2=val;myAnswer=val;
    conn.send({type:"answer",answer:val,num:curNum});
    updateStatusUI();
  }
}
function submitTextAnswer(){
  var v=$("textAnswer").value.trim();
  if(!v){toast("Écris d'abord une réponse !","err");return;}
  handleOwnAnswer(v);
}

function broadcastStatus(){conn.send({type:"status",p1:answered.p1,p2:answered.p2});updateStatusUI();}
function maybeReveal(){if(answered.p1&&answered.p2)hostEvaluate();}
function hostEvaluate(){
  var Q=QUESTIONS[order[qIndex]];
  var pts=lastQuestion.pts;
  var c1=isCorrect(Q,answers.p1),c2=isCorrect(Q,answers.p2);
  if(c1)scores.p1+=pts;if(c2)scores.p2+=pts;
  var msg={type:"reveal",correct:Q[3],pts:pts,c1:c1,c2:c2,scores:scores};
  conn.send(msg);
  renderReveal(msg);
  updateScoreboard();
  if(advanceTimer)clearTimeout(advanceTimer);
  advanceTimer=setTimeout(function(){qIndex++;sendQuestion();},3000);
}

function chipEl(name,ok){var c=document.createElement("span");c.className="chip "+(ok?"win":"lose");c.textContent=name+" : "+(ok?"Bonne réponse":"Raté");return c;}
function highlightOptions(correctLetter,myAns){
  var opts=document.querySelectorAll("#qcmArea .opt");
  var ci=correctLetter.charCodeAt(0)-65;
  for(var i=0;i<opts.length;i++){opts[i].disabled=true;opts[i].classList.remove("correct","wrong");}
  if(opts[ci])opts[ci].classList.add("correct");
  if(myAns){var mi=myAns.charCodeAt(0)-65;if(mi!==ci&&opts[mi])opts[mi].classList.add("wrong");}
}

function renderReveal(d){
  if(countdownInt)clearInterval(countdownInt);
  $("textArea").classList.add("hidden");
  $("waitingMsg").classList.add("hidden");
  var q=lastQuestion;
  var myCorrect=(role==="host")?d.c1:d.c2;
  var g=$("revealGood");g.textContent=myCorrect?"Bonne réponse !":"Mauvaise réponse !";g.className="reveal-good "+(myCorrect?"good":"bad");
  var a=$("revealAnswer");
  if(q.t===1){
    var letter=d.correct,idx=letter.charCodeAt(0)-65;
    var opt=(q.o&&q.o[idx])?letter+". "+q.o[idx]:letter;
    a.innerHTML="Bonne réponse : <b>"+opt+"</b>";
    highlightOptions(letter,myAnswer);
  }else{
    a.innerHTML="Réponse attendue : <b>"+d.correct+"</b>";
  }
  $("revealYour").textContent="Ta réponse : "+(myAnswer||"—");
  var chips=$("chips");chips.innerHTML="";
  chips.appendChild(chipEl(names.p1,d.c1));
  chips.appendChild(chipEl(names.p2,d.c2));
  var count=3;$("countdown").textContent="3";
  countdownInt=setInterval(function(){count--;if(count>=1){$("countdown").textContent=count;}else{clearInterval(countdownInt);}},1000);
  $("revealArea").classList.remove("hidden");
}

function buildOrder(){
  var n=parseInt($("qCountSel").value,10)||50;
  var idx=[];
  for(var i=0;i<QUESTIONS.length;i++)idx.push(i);
  if($("shuffleChk").checked){for(var k=idx.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1));var tmp=idx[k];idx[k]=idx[j];idx[j]=tmp;}}
  order=idx.slice(0,Math.min(n,QUESTIONS.length));
}
function initGame(d){
  total=d.total;
  if(d.names){names=d.names;$("p1Name").textContent=d.names.p1;$("p2Name").textContent=d.names.p2;}
  setScores(0,0);
  $("scoreboard").classList.remove("hidden");
  showScreen("screen-game");
}
function sendQuestion(){
  if(qIndex>=total){hostEndGame();return;}
  var qi=order[qIndex];
  var Q=QUESTIONS[qi];
  var diff=diffOf(qi);
  answered={p1:false,p2:false};answers={};myAnswer=null;
  var payload={type:"question",num:qIndex+1,total:total,q:Q[0],t:Q[1],o:Q[2],pts:diff.pts,diff:diff.name,dcls:diff.cls};
  conn.send(payload);
  lastQuestion=payload;
  renderQuestion(payload);
}
function hostEndGame(){conn.send({type:"end",scores:scores});renderEnd({scores:scores});}
function renderEnd(d){
  showScreen("screen-end");
  var s=d.scores||{p1:0,p2:0};
  var t=$("endTitle");
  if(s.p1>s.p2){t.textContent=names.p1+" gagne !";t.className="end-title good";}
  else if(s.p2>s.p1){t.textContent=names.p2+" gagne !";t.className="end-title good";}
  else{t.textContent="Égalité parfaite !";t.className="end-title tie";}
  $("endSub").textContent=(role==="host")?"Rejoue ou retourne au menu.":"L'hôte peut relancer une partie…";
  var l=$("endList");l.innerHTML="";
  function row(nm,pts,win){var r=document.createElement("div");r.className="endrow"+(win?" win":"");var n=document.createElement("span");n.textContent=nm;var p=document.createElement("span");p.className="pts";p.textContent=pts;r.appendChild(n);r.appendChild(p);return r;}
  l.appendChild(row(names.p1,s.p1,s.p1>s.p2));
  l.appendChild(row(names.p2,s.p2,s.p2>s.p1));
  $("btnReplay").classList.toggle("hidden",role!=="host");
}

function hostPeer(){
  myPseudo=$("pseudoInput").value.trim();
  if(!myPseudo){toast("Entre ton pseudo d'abord !","err");return;}
  role="host";
  names={p1:myPseudo,p2:"Adversaire"};
  $("lobbyMe").textContent=myPseudo;
  $("lobbyOpp").textContent="En attente…";$("oppState").textContent="—";$("oppSlot").classList.remove("ready");
  $("hostControls").classList.add("hidden");$("guestWait").classList.add("hidden");
  $("lobbySub").textContent="Salon créé — en attente d'un adversaire…";
  showScreen("screen-lobby");
  try{peer=new Peer(sanitizeId(myPseudo));}catch(e){toast("Impossible de créer le salon.","err");return;}
  peer.on("open",function(){toast("Salon créé ! Envoie ton pseudo à ton adversaire.");});
  peer.on("connection",function(c){
    bindConn(c);
    c.on("data",function(d){
      if(!d||!d.type)return;
      if(d.type==="hello"){
        otherPseudo=d.pseudo;
        names={p1:myPseudo,p2:otherPseudo};
        $("lobbyOpp").textContent=otherPseudo;$("oppState").textContent="Connecté";$("oppSlot").classList.add("ready");
        $("lobbySub").textContent="Adversaire trouvé — prêt !";
        $("hostControls").classList.remove("hidden");
        setScores(0,0);$("scoreboard").classList.remove("hidden");updateScoreboard();
        c.send({type:"welcome",pseudo:myPseudo});
      }else if(d.type==="answer"){
        if(d.num&&d.num!==curNum)return;
        if(!answered.p2){answered.p2=true;answers.p2=d.answer;broadcastStatus();maybeReveal();}
      }
    });
  });
  peer.on("error",onPeerError);
}
function joinPeer(){
  myPseudo=$("joinPseudo").value.trim();
  var host=$("hostPseudo").value.trim();
  if(!myPseudo||!host){toast("Renseigne les deux pseudos !","err");return;}
  role="guest";
  $("lobbyMe").textContent=myPseudo;
  $("lobbyOpp").textContent=host;
  $("oppState").textContent="Connexion…";
  $("hostControls").classList.add("hidden");$("guestWait").classList.add("hidden");
  $("lobbySub").textContent="Connexion au salon…";
  showScreen("screen-lobby");
  try{peer=new Peer();}catch(e){toast("Connexion impossible.","err");return;}
  peer.on("open",function(){
    var c=peer.connect(sanitizeId(host),{reliable:true});
    bindConn(c);
    c.on("open",function(){c.send({type:"hello",pseudo:myPseudo});});
    c.on("data",function(d){
      if(!d||!d.type)return;
      if(d.type==="welcome"){
        otherPseudo=d.pseudo;
        names={p1:otherPseudo,p2:myPseudo};
        $("lobbyOpp").textContent=otherPseudo;$("oppState").textContent="Connecté";$("oppSlot").classList.add("ready");
        $("lobbySub").textContent="Connecté à "+otherPseudo+" !";
        setScores(0,0);$("scoreboard").classList.remove("hidden");updateScoreboard();
        $("guestWait").classList.remove("hidden");
      }else if(d.type==="start"){initGame(d);}
      else if(d.type==="question"){curNum=d.num;renderQuestion(d);}
      else if(d.type==="status"){answered.p1=d.p1;answered.p2=d.p2;updateStatusUI();}
      else if(d.type==="reveal"){renderReveal(d);}
      else if(d.type==="end"){renderEnd(d);}
    });
  });
  peer.on("error",onPeerError);
}
function hostStartGame(){
  buildOrder();total=order.length;qIndex=0;
  setScores(0,0);
  conn.send({type:"start",total:total,names:names});
  initGame({total:total,names:names});
  sendQuestion();
}

$("btnHost").onclick=hostPeer;
$("btnJoin").onclick=function(){showScreen("screen-join");};
$("btnBackHome").onclick=goHome;
$("btnDoJoin").onclick=joinPeer;
$("btnStart").onclick=hostStartGame;
$("btnCancelLobby").onclick=goHome;
$("btnAbandon").onclick=goHome;
$("btnHomeEnd").onclick=goHome;
$("btnReplay").onclick=hostStartGame;
$("btnSubmitText").onclick=submitTextAnswer;
$("pseudoInput").addEventListener("keydown",function(e){if(e.key==="Enter")hostPeer();});
$("joinPseudo").addEventListener("keydown",function(e){if(e.key==="Enter")$("hostPseudo").focus();});
$("hostPseudo").addEventListener("keydown",function(e){if(e.key==="Enter")joinPeer();});
$("textAnswer").addEventListener("keydown",function(e){if(e.key==="Enter")submitTextAnswer();});
document.addEventListener("keydown",function(e){
  var sc=document.querySelector(".screen.active");
  if(!sc||sc.id!=="screen-game")return;
  if(e.key==="Enter"){if(!$("textArea").classList.contains("hidden")&&!$("btnSubmitText").disabled)submitTextAnswer();return;}
  var opts=document.querySelectorAll("#qcmArea .opt:not(:disabled)");
  if(!opts.length)return;
  var k=e.key.toLowerCase();
  var map={a:0,b:1,c:2,d:3,"1":0,"2":1,"3":2,"4":3};
  if(k in map&&map[k]<opts.length)opts[map[k]].click();
});

if(typeof Peer==="undefined"){
  toast("PeerJS n'a pas pu être chargé. Vérifie la connexion internet et recharge la page.","err");
}