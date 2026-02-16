package main

import (
	"os"

	"github.com/nkootstra/xpose/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
