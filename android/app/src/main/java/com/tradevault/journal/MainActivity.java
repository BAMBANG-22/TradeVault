package com.tradevault.journal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
