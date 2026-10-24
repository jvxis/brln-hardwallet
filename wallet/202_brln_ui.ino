#ifdef BOWSER_BRLN
// Original T-Display, rotation 1, USB to the right:
// upper button GPIO35 = '*'; lower BOOT/GPIO0 = '#'.
// All actionable text is at least 12 x 16 pixels. Never shrink to fit.
unsigned brlnInfoPage = 0;
unsigned brlnInfoPages = 1;

void brlnCentered(const String &text, int y, uint8_t size) {
  tft.setTextFont(1); tft.setTextSize(size); tft.setTextWrap(false);
  tft.setCursor(max(6, (tft.width() - int(text.length()) * 6 * size) / 2), y);
  tft.print(text);
}

void brlnAction(const String &label, bool upper) {
  if (!label.length()) return;
  tft.setTextFont(1); tft.setTextSize(2); tft.setTextWrap(false);
  tft.setTextColor(upper ? TFT_WHITE : tft.color565(78,224,193), BRLN_BACKGROUND);
  // Inset the arrow from the bezel, beside the physical button.
  int y = upper ? 6 : 113;
  tft.setCursor(216-int(label.length())*12, y); tft.print(label);
  tft.fillTriangle(220,y+2,220,y+12,227,y+7,
                   upper ? TFT_WHITE : tft.color565(78,224,193));
}

void brlnFrame(const String &upper, const String &lower, const String &footer) {
  beginUiScreen(); tft.fillScreen(BRLN_BACKGROUND);
  tft.setTextFont(1); tft.setTextSize(2); tft.setTextWrap(false);
  bool swap=tft.getSwapBytes(); tft.setSwapBytes(true);
  tft.pushImage(6,2,BRLN_MARK_WIDTH,BRLN_MARK_HEIGHT,BRLN_MARK_PIXELS);
  tft.setSwapBytes(swap);
  tft.drawFastHLine(6,26,228,tft.color565(78,224,193));
  tft.drawFastHLine(6,108,228,tft.color565(78,224,193));
  tft.setTextColor(TFT_WHITE,BRLN_BACKGROUND);
  tft.setCursor(6,113); tft.print(footer);
  brlnAction(upper,true); brlnAction(lower,false);
  tft.setTextColor(TFT_WHITE,BRLN_BACKGROUND);
}

// Character-exact chunks: no ellipsis, omissions, or font reduction.
// Security-relevant values use physical pages before accepting anything.
unsigned brlnPageCount(const String &text, unsigned capacity) {
  return max(1U, (unsigned(text.length())+capacity-1)/capacity);
}

void brlnLines(const String &text, unsigned start, int y, unsigned lines) {
  for(unsigned line=0;line<lines;line++) {
    unsigned offset=start+line*19;
    if(offset>=text.length()) break;
    brlnCentered(text.substring(offset,offset+19),y+line*19,2);
  }
}

String brlnLabel(const String &text) {
  if(text=="Wallet password") return "Senha da carteira";
  if(text=="Repeat password") return "Repita a senha";
  if(text=="Local operation") return "No Signer";
  if(text=="BIP39 passphrase") return "Passphrase BIP39";
  if(text=="create") return "Criar carteira?";
  if(text=="restore") return "Recuperar carteira?";
  if(text=="unlock") return "Desbloquear?";
  if(text=="unlock-passphrase") return "Com passphrase?";
  if(text=="backup") return "Conferir backup?";
  if(text=="DONE") return "PRONTO";
  if(text=="BACK") return "APAGAR";
  if(text=="CANCEL" || text=="Cancel") return "CANCELAR";
  if(text=="USE WORD") return "USAR";
  if(text==" ") return "ESPACO";
  if(text=="Backup recorded?") return "Anotou a seed?";
  if(text=="Keep it offline") return "Mantenha offline";
  if(text=="Wallet ready") return "Carteira pronta";
  if(text=="Wallet unlocked") return "Desbloqueada";
  if(text=="Continue in app") return "Abra o LightningOS";
  if(text=="Storage unavailable") return "Preparar memoria";
  if(text=="Format ERASES wallet") return "APAGAR a carteira?";
  if(text=="Have your backup?") return "Tem seu backup?";
  if(text=="Confirm ERASE") return "APAGAR tudo?";
  if(text=="Create BIP39") return "Gerar seed";
  if(text=="Restore BIP39") return "Recuperar backup";
  if(text=="Hardware RNG") return "Automatica";
  if(text=="100 dice rolls") return "Com dados";
  if(text=="12 words") return "12 palavras";
  if(text=="24 words") return "24 palavras";
  if(text=="No passphrase") return "Sem passphrase";
  if(text=="Enter passphrase") return "Usar passphrase";
  if(text=="Confirm signing" || text=="Sign reviewed PSBT?") return "Assinar agora?";
  if(text=="Outputs and fee reviewed" || text=="Review complete") return "Destinos e taxa ja conferidos";
  if(text=="BRLN experimental") return "EM TESTE";
  if(text=="No funds until tested") return "Use sem fundos reais";
  if(text=="Operation complete") return "Concluido";
  if(text=="Cancelled / invalid") return "Cancelado / invalido";
  if(text=="Cancelled" || text=="Operation canceled") return "Cancelado";
  if(text=="Backup review ended") return "Backup conferido";
  if(text=="Please wait") return "Aguarde";
  if(text=="Parsing PSBT...") return "Lendo transacao";
  if(text=="Signing PSBT...") return "Assinando";
  if(text=="Receiving PSBT") return "Recebendo transacao";
  if(text=="Signed inputs:") return "Entradas assinadas:";
  if(text=="PSBT unsupported") return "Transacao recusada";
  if(text=="PSBT rejected") return "Transacao recusada";
  if(text=="Invalid PSBT") return "Transacao invalida";
  if(text=="Signing failed") return "Falha ao assinar";
  if(text=="No inputs signed") return "Nada assinado";
  if(text=="PSBT transfer failed") return "Falha na transferencia";
  if(text=="Output rejected" || text=="Fee rejected" || text=="Signing rejected") return "Recusado no Signer";
  if(text=="BRLN: one destination") return "Aceita um destino";
  if(text=="BRLN: 1-2 outputs") return "Maximo 2 saidas";
  if(text=="BRLN: 1-20 inputs") return "Maximo 20 entradas";
  if(text=="BRLN: BIP84 inputs only") return "Entrada fora da conta";
  if(text=="BRLN: mainnet only") return "Somente mainnet";
  if(text.endsWith(" chunks")) return text.substring(0,text.length()-7)+" partes";
  if(text=="Wallet exists") return "Carteira existente";
  if(text=="Use another device") return "Use outro Signer";
  if(text=="12+ chars, no spaces") return "Senha: 12 ou mais caracteres, sem espacos";
  if(text.startsWith("Write word ")) return "Anote " + text.substring(11);
  if(text.startsWith("Word ")) return "Palavra " + text.substring(5);
  if(text.startsWith("Roll ")) return "Dado " + text.substring(5);
  return text;
}

void brlnHashScreen(const String &hash, bool help) {
  bool valid=hash.length()==64;
  brlnFrame(help?"":"AJUDA",help?"VOLTAR":valid?"CONFIRMAR":"",help?"AJUDA":"SHA256");
  if(help) {
    brlnLines("Compare os 64",0,32,1);
    brlnLines("digitos com a",0,51,1);
    brlnLines("versao publicada.",0,70,1);
    brlnLines("So aceite se igual.",0,89,1);
  } else if(valid) {
    tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
    for(unsigned row=0;row<4;row++) brlnCentered(hash.substring(row*16,row*16+16),32+row*19,2);
  } else {
    brlnLines("Hash indisponivel",0,42,1);
    brlnLines("Reinstale firmware",0,70,1);
  }
}

void brlnLocalScreen(const String &title,const String &value,const String &hint) {
  bool input=hint.startsWith("Selected: ");
  bool confirm=hint.startsWith("A: confirm");
  String heading=brlnLabel(title);
  brlnFrame(confirm?"CANCELAR":"PROXIMO",input?"ESCOLHER":confirm?"CONFIRMAR":"ESCOLHER",
    input && (title=="Wallet password" || title=="Repeat password")?"MIN 12":"");
  brlnCentered(heading,32,2);
  if(title=="Create BIP39" && (value=="Hardware RNG" || value=="100 dice rolls")) {
    tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
    brlnCentered(brlnLabel(value),57,3);
    tft.setTextColor(TFT_WHITE,BRLN_BACKGROUND);
    brlnCentered(value=="Hardware RNG"?"No Signer":"100 lances",87,2);
  } else if(title=="BIP39 passphrase" && !input && !confirm) {
    tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
    brlnCentered(brlnLabel(value),59,2);
    tft.setTextColor(TFT_WHITE,BRLN_BACKGROUND);
    brlnCentered("Opcional",85,2);
  } else if(input) {
    String shown=value;
    if(shown.endsWith(" chars")) shown="Tamanho: "+shown.substring(0,shown.length()-6);
    brlnCentered(shown,54,2);
    String selected=brlnLabel(hint.substring(10));
    tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
    brlnCentered(selected,77,selected.length()<=12?3:2);
  } else {
    String body=brlnLabel(value);
    tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
    if(body.length()<=12) brlnCentered(body,65,3);
    else brlnLines(body,0,60,2);
  }
}

void brlnWorkingScreen(const String &title) {
  brlnFrame("","","");
  brlnCentered(title,36,2);
  tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
  brlnCentered("Aguarde",63,3);
  brlnCentered("Nao desconecte",91,2);
}

void brlnPairScreen(const String &code) {
  brlnFrame("","","USB");
  brlnCentered("PAREAMENTO",32,2);
  tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
  brlnCentered(code,56,4);
  tft.setTextColor(TFT_WHITE,BRLN_BACKGROUND);
  brlnCentered("Compare no app",91,2);
}

String brlnWrap(const String &text) {
  String result=""; unsigned offset=0;
  while(offset<text.length()) {
    unsigned count=min(19U,unsigned(text.length())-offset);
    if(offset+count<text.length() && text[offset+count]!=' ') {
      for(unsigned n=count;n>0;n--) {
        if(text[offset+n-1]==' ') {count=n-1;break;}
      }
    }
    if(!count) {offset++;continue;}
    result+=text.substring(offset,offset+count);
    for(unsigned pad=count;pad<19;pad++) result+=" ";
    offset+=count;
    while(offset<text.length() && text[offset]==' ') offset++;
  }
  return result;
}

void brlnInfoScreen(const String &message,const String &additional) {
  if(message=="Wallet ready" || message=="Wallet unlocked") {
    brlnInfoPage=0; brlnInfoPages=1;
    brlnFrame("","","EM TESTE");
    brlnCentered(brlnLabel(message),38,2);
    tft.setTextColor(tft.color565(78,224,193),BRLN_BACKGROUND);
    brlnCentered("Continue no",66,2);
    brlnCentered("LightningOS",87,2);
    return;
  }
  String text=brlnLabel(message);
  if(additional.length()) text+=" | "+brlnLabel(additional);
  text=brlnWrap(text);
  brlnInfoPages=brlnPageCount(text,76);
  brlnInfoPage%=brlnInfoPages;
  brlnFrame(brlnInfoPages>1?"MAIS":"","",brlnInfoPages>1?String(brlnInfoPage+1)+"/"+String(brlnInfoPages):"");
  brlnLines(text,brlnInfoPage*76,32,4);
}

// Review values use up to three 19-character rows per page. Pages and rows are
// balanced: a 42-character address fits one screen as 3 x 14, and a long one
// never ends with a lone fragment on its last page.
const unsigned BRLN_REVIEW_ROWS=3, BRLN_REVIEW_ROW=19;
unsigned brlnReviewPages(const String &text) {
  return brlnPageCount(text,BRLN_REVIEW_ROWS*BRLN_REVIEW_ROW);
}

// One page of a value as balanced rows; y3/y2/y1 place three, two or one row.
void brlnValueRows(const String &text,unsigned page,unsigned pages,int y3,int y2,int y1) {
  unsigned length=text.length(), per=(length+pages-1)/pages;
  unsigned start=min(length,page*per), end=min(length,start+per);
  unsigned rows=max(1U,(end-start+BRLN_REVIEW_ROW-1)/BRLN_REVIEW_ROW);
  unsigned width=max(1U,(end-start+rows-1)/rows);
  int y=rows==3?y3:rows==2?y2:y1;
  for(unsigned row=0;row<rows && start+row*width<end;row++)
    brlnCentered(text.substring(start+row*width,min(end,start+(row+1)*width)),y+row*19,2);
}

void brlnReviewScreen(const String &title,const String &text,unsigned page,unsigned pages) {
  brlnFrame("CANCELAR",page+1<pages?"PROXIMO":"CONFIRMAR",pages>1?String(page+1)+"/"+String(pages):"");
  brlnCentered(title,32,2);
  tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
  brlnValueRows(text,page,pages,51,60,70);
}

// Public address or xpub shown for comparison: same balanced rows, no title.
void brlnPublicScreen(const String &text,unsigned page,unsigned pages) {
  brlnFrame("PAGINA","QR",String(page+1)+"/"+String(pages));
  brlnValueRows(text,page,pages,40,49,59);
}

bool brlnReviewText(const String &title,const String &text) {
  unsigned pages=brlnReviewPages(text);
  for(unsigned page=0;page<pages;page++) {
    brlnReviewScreen(title,text,page,pages);
    if(!awaitPhysicalReviewApproval()) return false;
  }
  return true;
}
#endif

#ifdef BOWSER_BRLN
void brlnAmountScreen(const String &title,const String &sats) {
  brlnFrame("CANCELAR","CONFIRMAR","");
  brlnCentered(title,32,2);
  tft.setTextColor(tft.color565(255,204,72),BRLN_BACKGROUND);
  if(sats.length()>19) brlnLines(sats,0,51,2);
  else brlnCentered(sats,57,sats.length()<=12?3:2);
  tft.setTextColor(TFT_WHITE,BRLN_BACKGROUND);
  brlnCentered("sats",sats.length()>19?91:86,2);
}
bool brlnReviewAmount(const String &title,const String &sats) {
  brlnAmountScreen(title,sats);
  return awaitPhysicalReviewApproval();
}
#endif
