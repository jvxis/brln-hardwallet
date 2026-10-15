// Host renderer executes the production layout with synthetic public fixtures only.
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
using std::max; using std::min;
struct String : std::string {
  using std::string::string;
  String(const std::string &s):std::string(s){}
  String(unsigned n):std::string(std::to_string(n)){}
  String(int n):std::string(std::to_string(n)){}
  String substring(unsigned a,unsigned b=~0U)const {return a>=size()?String(""):String(substr(a,min(b,unsigned(size()))-a));}
  bool startsWith(const String&s)const{return rfind(s,0)==0;}
  bool endsWith(const String&s)const{return size()>=s.size()&&compare(size()-s.size(),s.size(),s)==0;}
};
#define PROGMEM
#define BOWSER_BRLN
#define TFT_WHITE 0xffff
#include "../wallet/brln_brand.h"
#include "../wallet/brln_hash_gate.h"
#include "../wallet/brln_password_entry.h"
#include "../libraries/TFT_eSPI/Fonts/glcdfont.c"
struct Display {
  uint16_t pixels[240*135]={}; int x=0,y=0,size=2; uint16_t fg=0xffff,bg=0; bool swap=false;
  int width(){return 240;}
  void pixel(int a,int b,uint16_t c){if(a>=0&&a<240&&b>=0&&b<135)pixels[b*240+a]=c;}
  void fillScreen(uint16_t c){std::fill(pixels,pixels+240*135,c);}
  void setTextFont(int n){assert(n==1);}
  void setTextSize(int n){assert(n>=2);size=n;}
  void setTextWrap(bool){}
  void setTextColor(uint16_t a,uint16_t b){fg=a;bg=b;}
  void setCursor(int a,int b){x=a;y=b;}
  bool getSwapBytes(){return swap;}
  void setSwapBytes(bool s){swap=s;}
  uint16_t color565(int r,int g,int b){return ((r&248)<<8)|((g&252)<<3)|(b>>3);}
  void drawFastHLine(int a,int b,int w,uint16_t c){for(int i=0;i<w;i++)pixel(a+i,b,c);}
  void pushImage(int a,int b,int w,int h,const uint16_t*p){for(int j=0;j<h;j++)for(int i=0;i<w;i++)pixel(a+i,b+j,p[j*w+i]);}
  void fillTriangle(int ax,int ay,int bx,int by,int cx,int cy,uint16_t c){
    for(int j=min(ay,min(by,cy));j<=max(ay,max(by,cy));j++)for(int i=min(ax,min(bx,cx));i<=max(ax,max(bx,cx));i++){
      int d1=(i-bx)*(ay-by)-(ax-bx)*(j-by),d2=(i-cx)*(by-cy)-(bx-cx)*(j-cy),d3=(i-ax)*(cy-ay)-(cx-ax)*(j-ay);
      if(!((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0)))pixel(i,j,c);
    }
  }
  void print(const String&s){
    if(x<0||x+int(s.length())*6*size>240||y<0||y+8*size>135){std::cerr<<"Clipped text: "<<s<<" at "<<x<<","<<y<<" size "<<size<<"\n";std::abort();}
    for(unsigned char ch:s){
      for(int a=0;a<6;a++)for(int b=0;b<8;b++){
      bool on=a<5&&(font[ch*5+a]&(1<<b));
      for(int dx=0;dx<size;dx++)for(int dy=0;dy<size;dy++)pixel(x+a*size+dx,y+b*size+dy,on?fg:bg);
      }
      x+=6*size;
    }
  }
  void save(const std::string&name){std::ofstream f("artifacts/ui-device-"+name+".ppm",std::ios::binary);f<<"P6\n240 135\n255\n";for(auto c:pixels){char rgb[]={char(((c>>11)&31)*255/31),char(((c>>5)&63)*255/63),char((c&31)*255/31)};f.write(rgb,3);}}
} tft;
void beginUiScreen(){}
int acceptCount=0,rejectAt=-1;
bool awaitPhysicalReviewApproval(){return acceptCount++!=rejectAt;}
#include "../wallet/202_brln_ui.ino"
int main(){
  for(unsigned n=0;n<40;n++) assert(brlnPasswordCanFinish(n)==(n>=12 && n<=32));
  assert(!brlnPasswordCharacterAllowed(' '));assert(brlnPasswordCharacterAllowed('a'));
  brlnWorkingScreen("Criando carteira");tft.save("creating");
  brlnInfoScreen("Wallet ready","Continue in app");tft.save("ready");
  brlnLocalScreen("Backup recorded?","Keep it offline","A: confirm");tft.save("backup");
  bool help=false;
  assert(brlnHashKey('#',false,help)==BrlnHashAction::Wait);
  assert(brlnHashKey('*',true,help)==BrlnHashAction::Redraw && help);
  assert(brlnHashKey('#',true,help)==BrlnHashAction::Redraw && !help);
  assert(brlnHashKey('#',true,help)==BrlnHashAction::Approve);
  for(int k=0;k<256;k++){help=false;assert(brlnHashKey(char(k),false,help)!=BrlnHashAction::Approve);}
  String hash="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  brlnHashScreen(hash,false);tft.save("hash");
  brlnHashScreen(hash,true);tft.save("help");
  brlnHashScreen("",false);tft.save("hash-error");
  brlnPairScreen("50711");tft.save("pair");
  brlnLocalScreen("Local operation","create","A: confirm");tft.save("confirm");
  brlnLocalScreen("Wallet password","0 chars","Selected: a");tft.save("password");
  brlnLocalScreen("Wallet password","5 chars","Selected: MINIMO 12");tft.save("short-password");
  brlnLocalScreen("Repeat password","32 chars","Selected: a");tft.save("repeat");
  brlnLocalScreen("Word 24/24","aban_","Selected: USE WORD");tft.save("restore");
  brlnLocalScreen("Write word 24/24","abandon","A: confirm");tft.save("word");
  brlnLocalScreen("Storage unavailable","Format ERASES wallet","A: confirm");tft.save("erase");
  brlnLocalScreen("Create BIP39","Hardware RNG","Choose on device");tft.save("entropy-auto");
  brlnLocalScreen("Create BIP39","100 dice rolls","Choose on device");tft.save("entropy");
  brlnLocalScreen("Confirm signing","Outputs and fee reviewed","A: confirm");tft.save("sign");
  const char *choices[]={"Hardware RNG","100 dice rolls","No passphrase","Enter passphrase","12 words","24 words","Cancel"};
  for(auto value:choices) brlnLocalScreen("BIP39 passphrase",value,"Choose on device");
  for(int ch=32;ch<127;ch++) brlnLocalScreen("BIP39 passphrase",String(16,'x'),String("Selected: ")+String(1,char(ch)));
  brlnLocalScreen("Wallet password","12 chars","Selected: CANCEL");tft.save("cancel-entry");
  // Full 62-character address across pages, never a prefix/suffix abbreviation.
  String address="bc1p"+String(58,'q');
  assert(brlnPageCount(address,38)==2);
  for(unsigned i=0;i<2;i++){brlnReviewScreen("Destino 64",address,i,2);tft.save("address-"+std::to_string(i+1));}
  brlnAmountScreen("Valor 64","2100000000000000");tft.save("amount");
  brlnAmountScreen("Valor maximo","18446744073709551615");tft.save("amount-max");
  brlnAmountScreen("Taxa da rede","1234");tft.save("fee");
  for(int reject=0;reject<2;reject++){acceptCount=0;rejectAt=reject;assert(!brlnReviewText("Destino",address));assert(acceptCount==reject+1);}
  acceptCount=0;rejectAt=-1;assert(brlnReviewText("Destino",address));assert(acceptCount==2);
  brlnInfoScreen("12+ chars, no spaces","");tft.save("error");
  String longText(200,'x');brlnInfoScreen(longText,"");assert(brlnInfoPages==3);
  std::cout<<"Rendered production screens; text bounds/minimum size and physical page rejection passed.\n";
}
