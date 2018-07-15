module io.github.jython234.matrix.bridges.discord {
    requires java.base;
    requires java.desktop;
    requires jdk.incubator.httpclient;

    requires snakeyaml;

    requires slf4j.api;

    requires JDA;

    requires org.commonmark;

    requires commons.io;

    requires io.github.jython234.matrix.appservice;
    requires io.github.jython234.matrix.bridge;

    opens io.github.jython234.matrix.bridges.discord to io.github.jython234.matrix.bridge;
}