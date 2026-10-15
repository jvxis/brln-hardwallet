#ifdef BOWSER_BRLN
#include "brln_password_entry.h"
// Local-only entry uses physical button events. Serial packets cannot select,
// confirm or cancel these screens. No input or mnemonic is returned to the host.
void brlnClear(String &value) {
  for (size_t i=0;i<value.length();i++) value.setCharAt(i,0);
  value.remove(0);
}

void brlnScreen(const String &title,const String &value,const String &hint) {
  brlnLocalScreen(title,value,hint);
}

int brlnChoice(const String &title,const char *const *items,int count) {
  int selected=0;armInputForPrompt();
  brlnScreen(title,items[selected],"Choose on device");
  unsigned long started=millis();
  while (uint32_t(millis()-started)<10UL*60*1000) {
    char key=pollInputKey();
    if (key=='*') {selected=(selected+1)%count;brlnScreen(title,items[selected],"Choose on device");}
    if (key=='#') return selected;
    delay(10);
  }
  return -1;
}

bool brlnConfirm(const String &title,const String &detail) {
  brlnScreen(title,detail,"A: confirm   B: cancel");
  return awaitPhysicalReviewApproval();
}

char brlnWaitKey() {
  unsigned long started=millis();
  while(uint32_t(millis()-started)<10UL*60*1000) {
    char key=pollInputKey();if(key=='*' || key=='#')return key;
    delay(10);
  }
  return 0;
}

bool brlnText(const String &title,String &output,bool hide,size_t maximum) {
  brlnClear(output);
  const char alphabet[]="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%^&*()-_=+[]{}:;,.?/";
  const int count=sizeof(alphabet)-1;
  int selected=3; // Start on the actual character 'a', never on DONE.
  armInputForPrompt();unsigned long started=millis();
  while (uint32_t(millis()-started)<15UL*60*1000) {
    String shown=hide?String(output.length())+" chars":output.substring(output.length()>16?output.length()-16:0);
    String item=selected==0?(hide && !brlnPasswordCanFinish(output.length())?"MINIMO 12":"DONE"):selected==1?"BACK":selected==2?"CANCEL":String(alphabet[selected-3]);
    brlnScreen(title,shown,"Selected: "+item);
    char key=brlnWaitKey();
    if(!key){brlnClear(output);return false;}
    if (key=='*') {
      do { selected=(selected+1)%(count+3); }
      while(hide && selected>=3 && !brlnPasswordCharacterAllowed(alphabet[selected-3]));
    }
    if (key=='#') {
      if (selected==0) {
        if(!hide || brlnPasswordCanFinish(output.length())) return true;
        continue; // Preserve entry and remain on the same prompt.
      }
      if (selected==1 && output.length()) output.remove(output.length()-1);
      if (selected==2) {brlnClear(output);return false;}
      if (selected>=3 && output.length()<maximum) output+=alphabet[selected-3];
    }
  }
  brlnClear(output);return false;
}

bool brlnWord(const String &title,String &word) {
  String prefix="";int selected=0;armInputForPrompt();
  while (true) {
    String options[29];int count=0;
    options[count++]="CANCEL";if(prefix.length())options[count++]="BACK";
    int matches=0;const char *unique=NULL;bool exact=false;
    for(int i=0;i<2048;i++) {
      const char *candidate=bip39_get_word_by_index(NULL,i);
      if(candidate && String(candidate).startsWith(prefix)){matches++;unique=candidate;if(String(candidate)==prefix)exact=true;}
    }
    if(matches==1) {
      if(brlnConfirm(title,String(unique))) {word=unique;brlnClear(prefix);return true;}
      if(prefix.length())prefix.remove(prefix.length()-1);
      selected=0;continue;
    }
    // Some valid words (e.g. "act") are also prefixes of other BIP39 words.
    if(exact)options[count++]="USE WORD";
    for(char letter='a';letter<='z';letter++) {
      bool exists=false;String next=prefix+letter;
      for(int i=0;i<2048 && !exists;i++) {
        const char *candidate=bip39_get_word_by_index(NULL,i);
        exists=candidate && String(candidate).startsWith(next);
      }
      if(exists) options[count++]=String(letter);
    }
    selected%=count;brlnScreen(title,prefix+"_","Selected: "+options[selected]);
    char key=brlnWaitKey();
    if(!key){brlnClear(prefix);return false;}
    if(key=='*')selected=(selected+1)%count;
    if(key=='#') {
      if(options[selected]=="CANCEL"){brlnClear(prefix);return false;}
      if(options[selected]=="USE WORD"){
        if(brlnConfirm(title,prefix)){word=prefix;brlnClear(prefix);return true;}
        selected=0;continue;
      }
      if(options[selected]=="BACK")prefix.remove(prefix.length()-1);else prefix+=options[selected];
      selected=0;
    }
  }
}

bool brlnReview(const String &mnemonic) {
  int words=1;for(size_t i=0;i<mnemonic.length();i++)if(mnemonic[i]==' ')words++;
  for(int i=0;i<words;i++) {
    if(!brlnConfirm("Write word "+String(i+1)+"/"+String(words),getWordAtPosition(mnemonic,i)))return false;
  }
  return brlnConfirm("Backup recorded?","Keep it offline");
}

CommandResponse executeBrlnLocal(String command) {
  const bool advanced=command=="/brln-unlock-passphrase";
  const bool unlocking=command=="/brln-unlock" || advanced;
  if(!brlnConfirm("Local operation",command.substring(6))) {
    sendCommandOutput(command,"0 cancelled");return {"Cancelled",""};
  }
  if(command=="/brln-backup") {
    bool ok=global.authenticated && brlnReview(global.mnemonic);
    sendCommandOutput(command,ok?"1":"0 cancelled");return {"Backup review ended",""};
  }
  if(!unlocking && global.walletConfigured) {
    sendCommandOutput(command,"0 already_configured");return {"Wallet exists","Use another device"};
  }
  global.authenticated=false;brlnClear(global.mnemonic);brlnClear(global.passphrase);
  String password="",repeat="",mnemonic="",passphrase="";
  bool ok=false;
  do {
    if(!brlnText("Wallet password",password,true,32))break;
    if(password.length()<12 || password.indexOf(' ')!=-1) {showMessage("12+ chars, no spaces","");break;}
    if(unlocking) {
      brlnWorkingScreen("Desbloqueando");
      if(!unlockProtectedWallet(password))break;
      if(advanced) {
        if(!brlnConfirm("Passphrase BIP39","Outra carteira"))break;
        if(!brlnText("BIP39 passphrase",passphrase,false,64) || passphrase.length()==0)break;
      }
      global.passphrase=passphrase;global.authenticated=true;ok=true;break;
    }
    if(!brlnText("Repeat password",repeat,true,32) || password!=repeat)break;
    if(command=="/brln-restore") {
      const char *counts[]={"12 words","24 words","Cancel"};int choice=brlnChoice("Restore BIP39",counts,3);
      if(choice<0 || choice==2)break;int count=choice==0?12:24;bool complete=true;
      for(int i=0;i<count;i++) {
        String word="";
        if(!brlnWord("Word "+String(i+1)+"/"+String(count),word)){complete=false;break;}
        if(i)mnemonic+=" ";mnemonic+=word;brlnClear(word);
      }
      if(!complete || !mnemonicIsValid(mnemonic))break;
    } else {
      const char *methods[]={"Hardware RNG","100 dice rolls","Cancel"};
      int choice=brlnChoice("Create BIP39",methods,3);if(choice<0 || choice==2)break;
      if(choice==0)mnemonic=generateStrongerMnemonic(24);
      else {
        char rolls[100]={0};bool complete=true;const char *digits[]={"1","2","3","4","5","6","Cancel"};
        for(int i=0;i<100;i++){int digit=brlnChoice("Roll "+String(i+1)+"/100",digits,7);if(digit<0 || digit==6){complete=false;break;}rolls[i]='1'+digit;}
        uint8_t entropy[32]={0};
        if(complete && wally_sha256((uint8_t*)rolls,sizeof(rolls),entropy,sizeof(entropy))==WALLY_OK)mnemonic=mnemonicFromBytes(entropy,sizeof(entropy));
        clearSensitiveBytes((uint8_t*)rolls,sizeof(rolls));clearSensitiveBytes(entropy,sizeof(entropy));
      }
      if(mnemonic=="" || !mnemonicIsValid(mnemonic))break;
    }
    if(!brlnReview(mnemonic))break;
    brlnWorkingScreen(command=="/brln-restore"?"Recuperando":"Criando carteira");
    HwwInitData data=initHww(password,mnemonic,"",true);
    armInputForPrompt(); // Discard held/extra presses during persistence.
    ok=data.success;if(ok){global.passwordVerifier=data.passwordVerifier;global.mnemonic=data.mnemonic;global.authenticated=true;}
    brlnClear(data.mnemonic);
  }while(false);
  brlnClear(password);brlnClear(repeat);brlnClear(mnemonic);brlnClear(passphrase);
  if(!ok){global.authenticated=false;brlnClear(global.mnemonic);brlnClear(global.passphrase);}
  sendCommandOutput(command,ok?"1":"0 cancelled_or_invalid");
  return {ok?(unlocking?"Wallet unlocked":"Wallet ready"):"Cancelled / invalid",ok?"Continue in app":"BRLN experimental"};
}
#endif
