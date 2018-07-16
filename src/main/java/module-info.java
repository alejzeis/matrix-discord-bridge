/**
 * A rough implementation of Discord <-> Matrix bridge in Java
 */
module matrixjava.bridges.discord {
    requires java.base;
    requires java.desktop;
    requires jdk.incubator.httpclient;

    requires matrixjava.appservice;
    requires matrixjava.bridge;

    requires snakeyaml;

    requires slf4j.api;

    requires JDA;

    requires org.commonmark;

    requires commons.io;

    opens io.github.jython234.matrix.bridges.discord to matrixjava.bridge;
}