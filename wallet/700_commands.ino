//========================================================================//
//================================COMMANDS================================//
//========================================================================//

CommandResponse cmdRes = {"", ""};
bool waitingAnimationPending = true;


void listenForCommands() {
  if (waitingAnimationPending) {
    startThinkingAnimation();
    waitingAnimationPending = false;
  } else if (cmdRes.message != "" || cmdRes.subMessage != "") {
    showMessage(cmdRes.message, cmdRes.subMessage);
  }


  // if the command does not handle an event then it bubbles it up
  EventData event = cmdRes.event;
  if (isNotCommandEvent(event.type)) {
    event = awaitEvent();
  }
  stopThinkingAnimation();

#ifdef BOWSER_BRLN
  if(event.type==EVENT_BUTTON_ACTION && event.data=="cancel" && brlnInfoPages>1) {
    brlnInfoPage=(brlnInfoPage+1)%brlnInfoPages;
  }
#endif
  if (isNotCommandEvent(event.type)) return;

  String data = event.data;

  Command c = extractCommand(data);
  if (isEncryptedCommand(c.cmd) && isNotInternalCommand(event.type)) {
    c = decryptAndExtractCommand(data);
  }
  // Do not remove this log line. Flushes stale data from buffer.
  logInfo("received command: " + c.cmd);
#ifdef BOWSER_BRLN
  brlnInfoPage=0; brlnInfoPages=1;
#endif
  cmdRes = executeCommand(c);

  delay(DELAY_MS);
}

bool isEncryptedCommand(String cmd) {
#ifdef BOWSER_BRLN
  if (cmd == COMMAND_BRLN_PAIR_COMMIT || cmd == COMMAND_BRLN_PAIR_REVEAL) return false;
#endif
  return cmd != COMMAND_PAIR &&
         cmd != COMMAND_CHECK_PAIRING &&
         cmd != COMMAND_PING;
}

bool isNotInternalCommand(String type) {
  return type != EVENT_INTERNAL_COMMAND;
}

bool isNotCommandEvent(String type) {
  return type != EVENT_SERIAL_DATA && type != EVENT_INTERNAL_COMMAND;
}


CommandResponse executeCommand(Command c) {
#ifdef BOWSER_BRLN
  // The BRLN wiring is compiled in. A host cannot remap physical approval pins
  // or request a different persistence mode through the legacy pair options.
  // Legacy pairing has no key commitment or frame authentication.
  if (c.cmd == COMMAND_PAIR || c.cmd == COMMAND_CHECK_PAIRING) {
    Serial.println(c.cmd + " 1 brln3_pairing_required");
    return {"Pairing refused", "Update the app"};
  }
  if (c.cmd == COMMAND_BRLN_PAIR_COMMIT) return executeBrlnPairCommit(c.data);
  if (c.cmd == COMMAND_BRLN_PAIR_REVEAL) return executeBrlnPairReveal(c.data);
  if (brln::forbiddenHostSecretCommand(c.cmd.c_str())) {
    sendCommandOutput(c.cmd, "0 device_only");
    return {"Use local controls", "Host secrets refused"};
  }
  if (c.cmd == "/capabilities") {
    sendCommandOutput(c.cmd, "brln-3 mainnet bip84 local-secrets physical-review explicit-passphrase");
    return {"BRLN experimental", "No funds until tested"};
  }
  if (brln::localCommand(c.cmd.c_str())) {
    if (!brln::allowedLocalCommand(c.cmd.c_str(), c.data.c_str())) {
      sendCommandOutput(c.cmd,"0 invalid_request");
      return {"Request refused", "No host arguments"};
    }
    return executeBrlnLocal(c.cmd);
  }
#endif
  if (c.cmd == COMMAND_PING)
    return executePing(c.data);

  if (c.cmd == COMMAND_CHECK_PAIRING)
    return executeCheckPairing(c.data);

  if (c.cmd == COMMAND_PAIR)
    return executePair(c.data);

  if (c.cmd == COMMAND_HELP)
    return executeHelp(c.data);

  if (c.cmd == COMMAND_WIPE)
    return executeWhipeHww(c.data);

  if (c.cmd == COMMAND_PASSWORD)
    return executePasswordCheck(c.data);

  if (c.cmd == COMMAND_PASSWORD_CLEAR)
    return executePasswordClear(c.data);

  if (c.cmd == COMMAND_ADDRESS)
    return executeShowAddress(c.data);

  if (c.cmd == COMMAND_SEED)
    return executeShowSeed(c.data);

  if (c.cmd == COMMAND_SEND_PSBT)
    return executeSignPsbt(c.data);

  if (c.cmd == COMMAND_PSBT_BEGIN)
    return executePsbtTransferBegin(c.data);

  if (c.cmd == COMMAND_PSBT_CHUNK)
    return executePsbtTransferChunk(c.data);

  if (c.cmd == COMMAND_PSBT_COMMIT)
    return executePsbtTransferCommit(c.data);

  if (c.cmd == COMMAND_RESTORE)
    return executeRestore(c.data);

  if (c.cmd == COMMAND_CREATE)
    return executeCreate(c.data);

  if (c.cmd == COMMAND_XPUB)
    return executeXpub(c.data);

  if (c.cmd == COMMAND_TRNG)
    return executeTrng(c.data);

  // Never echo decrypted command arguments into serial or SD diagnostics.
  // A typo in a password/restore command must not turn its secret into a log.
  return executeUnknown(c.cmd);

}


HwwInitData initHww(String password, String mnemonic, String passphrase, bool persistSecrets) {
  if (isValidPassword(password) == false)
    return {"", "", false};

  if (mnemonic == "") {
    mnemonic = generateStrongerMnemonic(24); // todo: allow 12 also
    if (mnemonic == "") return {"", "", false};
  }

  if (!initializeProtectedWallet(password, mnemonic, persistSecrets)) {
    mnemonic = "";
    return {"", "", false};
  }

  global.walletConfigured = true;
  return {global.passwordVerifier, mnemonic, true};
}

void sendCommandOutput(const String &command, const String &commandData) {
  commandOutToFile(command + " " + commandData);
  serialPrintlnSecure(command + " " + commandData);
}

void serialPrintlnSecure(const String &msg) {
#ifdef BOWSER_BRLN
  String sealed = brlnSealLine(msg);
  if (sealed == "") {
    logInfo("Secure output aborted: no authenticated channel");
    return;
  }
  Serial.println(sealed);
  return;
#endif
  String encryptedHex = encryptDataWithIv(global.dhe_shared_secret, msg);
  if (encryptedHex == "") {
    logInfo("Secure output aborted: RNG health check failed");
    return;
  }
  Serial.println(encryptedHex);
}

void commandOutToFile(const String &msg) {
  if (global.hasCommandsFile == true) {
    appendFile(SD, global.commandsOutFileName.c_str(), msg + "\n");
  }
}

Command decryptAndExtractCommand(const String &ecryptedData) {
#ifdef BOWSER_BRLN
  return extractCommand(brlnOpenLine(ecryptedData));
#endif
  String data = decryptDataWithIv(global.dhe_shared_secret, ecryptedData);
  return extractCommand(data);
}

EventData toggleDatanAndQR(String data, bool showQR) {
#ifdef BOWSER_BRLN
  // Public address/xpub: every character stays available at a readable size.
  unsigned page=0, pages=brlnPageCount(data,57);
  armInputForPrompt();
  while(true) {
    if(showQR) {
      // Keep the complete QR area; labels must not obscure its modules.
      showQRCode(data);
    } else {
      brlnFrame("PAGINA","QR",String(page+1)+"/"+String(pages));
      brlnLines(data,page*57,36,3);
    }
    EventData event=awaitEvent();
    if(event.type!=EVENT_BUTTON_ACTION) return event;
    if(event.data=="confirm") showQR=!showQR;
    else {showQR=false; page=(page+1)%pages;}
  }
#else
  String dataUpper = data + "";
  dataUpper.toUpperCase();

  if (showQR == true) {
    showQRCode(dataUpper);
  } else {
    showMessage(data, "");
    setUiControls(UiControls::ToggleOnly);
  }

  armInputForPrompt();
  EventData event = awaitEvent();
  while (event.type == EVENT_BUTTON_ACTION) {
    showQR = !showQR;
    if (showQR == true) {
      showQRCode(dataUpper);
    } else {
      showMessage(data, "");
      setUiControls(UiControls::ToggleOnly);
    }
    event = awaitEvent();
  }
  return event;
#endif
}
